import * as fs from 'fs';
import path from 'path';
import JSON5 from 'json5';
import { logger } from '@runejs/core';
import { Xtea, XteaKeys } from '@runejs/core/encryption';


export type ArchiveContentType = 'groups' | 'files';


export type FileEncryptionType = 'none' | 'xtea';


export interface ArchiveContentConfig {
    type?: ArchiveContentType;
    encryption?: FileEncryptionType;
    fileExtension?: string;
    saveFileNames?: boolean;
    defaultFileNames?: { [key: string]: number };
}


export interface ArchiveInfo {
    index: number;
    name: string;
    format?: number;
    compression: string;
    content?: ArchiveContentConfig;
}


export class ArchiveConfig {

    public readonly configPath: string;

    private readonly configs: Map<string, ArchiveInfo>;
    private readonly fileNames: Map<number, string>;
    private readonly xteaKeys: Map<string, XteaKeys[]>;

    public constructor(configPath: string) {
        this.configPath = configPath;
        this.configs = new Map<string, ArchiveInfo>();
        this.fileNames = new Map<number, string>();
        this.xteaKeys = new Map<string, XteaKeys[]>();
    }

    public getXteaKey(fileName: string): XteaKeys[] | null;
    public getXteaKey(fileName: string, gameVersion: number): XteaKeys | null;
    public getXteaKey(fileName: string, gameVersion?: number | undefined): XteaKeys | XteaKeys[] | null;
    public getXteaKey(fileName: string, gameVersion?: number | undefined): XteaKeys | XteaKeys[] | null {
        if(!this.xteaKeys.size) {
            this.loadXteaKeys();
        }

        if(!this.xteaKeys.size) {
            logger.error(`XTEA keys could not be loaded.`);
            return null;
        }

        const keySets = this.xteaKeys.get(fileName);
        if(!keySets) {
            return null;
        }

        if(gameVersion !== undefined) {
            return keySets.find(keySet => keySet.gameVersion === gameVersion) ?? null;
        }

        return keySets;
    }

    public getArchiveInfo(archiveIndex: string): ArchiveInfo {
        if(!this.configs.size) {
            this.loadConfig();
        }

        return this.configs.get(archiveIndex);
    }

    public getArchiveGroupNames(archiveIndex: string): { [groupName: string]: number } {
        return this.getArchiveInfo(archiveIndex)?.content?.defaultFileNames ?? {};
    }

    public getArchiveName(archiveIndex: string): string | undefined {
        return this.getArchiveInfo(archiveIndex)?.name ?? undefined;
    }

    public getArchiveIndex(archiveName: string): string | undefined {
        for(const [ archiveIndex, archive ] of this.configs) {
            if(archive.name === archiveName) {
                return archiveIndex;
            }
        }

        return undefined;
    }

    public hashFileName(fileName: string): number {
        let hash = 0;
        for(let i = 0; i < fileName.length; i++) {
            hash = fileName.charCodeAt(i) + ((hash << 5) - hash);
        }

        return hash | 0;
    }

    public getFileName(nameHash: string | number): string | undefined {
        if(typeof nameHash === 'string') {
            nameHash = Number(nameHash);
        }

        if(!this.fileNames.size) {
            this.loadFileNames();
        }

        return this.fileNames.get(nameHash) ?? undefined;
    }

    public loadXteaKeys(): void {
        Xtea.loadKeys(path.join(this.configPath, 'xtea'));
    }

    public loadFileNames(): void {
        const configPath = path.join(this.configPath, 'name-hashes.json');
        if(!fs.existsSync(configPath)) {
            logger.error(`Error loading file names: ${configPath} was not found.`);
            return;
        }

        try {
            const nameTable = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { [key: string]: string };
            Object.keys(nameTable).forEach(nameHash => this.fileNames.set(Number(nameHash), nameTable[nameHash]));
        } catch(error) {
            logger.error(`Error loading file names:`, error);
        }
    }

    public loadConfig(): void {
        const configPath = path.join(this.configPath, 'archives.json5');
        if(!fs.existsSync(configPath)) {
            logger.error(`Error loading archive config: ${configPath} was not found.`);
            return;
        }

        try {
            const archiveInfo = JSON5.parse(fs.readFileSync(configPath, 'utf-8')) as { [key: string]: ArchiveInfo };
            const archiveNames = Object.keys(archiveInfo);
            for(const archiveName of archiveNames) {
                const archive = archiveInfo[archiveName];
                archive.name = archiveName;
                this.configs.set(String(archive.index), archive);
            }
        } catch(error) {
            logger.error(`Error loading archive config:`, error);
        }
    }

}
