import * as fs from 'fs';
import path from 'path';
import JSON5 from 'json5';
import { logger } from '@runejs/core';
import { Xtea, XteaKeys } from '@runejs/core/encryption';


export type ArchiveContentType = 'groups' | 'files';


export type FileEncryptionType = 'none' | 'xtea';


export interface ArchiveContentDetails {
    type?: ArchiveContentType;
    encryption?: FileEncryptionType;
    fileExtension?: string;
    saveFileNames?: boolean;
    defaultFileNames?: { [key: string]: number };
}


export interface ArchiveDetails {
    index: number;
    name: string;
    format?: number;
    compression: string;
    content?: ArchiveContentDetails;
}


export class ArchiveConfig {

    private static _configPath: string;

    private static readonly configs: Map<string, ArchiveDetails> = new Map<string, ArchiveDetails>();
    private static readonly fileNames: Map<number, string> = new Map<number, string>();
    private static readonly xteaKeys: Map<string, XteaKeys[]> = new Map<string, XteaKeys[]>();

    public static register(configPath: string): void {
        ArchiveConfig._configPath = configPath;
    }

    public static getXteaKey(fileName: string): XteaKeys[] | null;
    public static getXteaKey(fileName: string, gameVersion: number): XteaKeys | null;
    public static getXteaKey(fileName: string, gameVersion?: number | undefined): XteaKeys | XteaKeys[] | null;
    public static getXteaKey(fileName: string, gameVersion?: number | undefined): XteaKeys | XteaKeys[] | null {
        if(!ArchiveConfig.xteaKeys.size) {
            ArchiveConfig.loadXteaKeys();
        }

        if(!ArchiveConfig.xteaKeys.size) {
            logger.error(`XTEA keys could not be loaded.`);
            return null;
        }

        const keySets = ArchiveConfig.xteaKeys.get(fileName);
        if(!keySets) {
            return null;
        }

        if(gameVersion !== undefined) {
            return keySets.find(keySet => keySet.gameVersion === gameVersion) ?? null;
        }

        return keySets;
    }

    public static getArchiveDetails(archiveIndex: string): ArchiveDetails {
        if(!ArchiveConfig.configs.size) {
            ArchiveConfig.loadConfig();
        }

        return ArchiveConfig.configs.get(archiveIndex);
    }

    public static getArchiveGroupNames(archiveIndex: string): { [groupName: string]: number } {
        return ArchiveConfig.getArchiveDetails(archiveIndex)?.content?.defaultFileNames ?? {};
    }

    public static getArchiveName(archiveIndex: string): string | undefined {
        return ArchiveConfig.getArchiveDetails(archiveIndex)?.name ?? undefined;
    }

    public static getArchiveIndex(archiveName: string): string | undefined {
        for(const [ archiveIndex, archive ] of ArchiveConfig.configs) {
            if(archive.name === archiveName) {
                return archiveIndex;
            }
        }

        return undefined;
    }

    public static hashFileName(fileName: string): number {
        let hash = 0;
        for(let i = 0; i < fileName.length; i++) {
            hash = fileName.charCodeAt(i) + ((hash << 5) - hash);
        }

        return hash | 0;
    }

    public static getFileName(nameHash: string | number): string | undefined {
        if(typeof nameHash === 'string') {
            nameHash = Number(nameHash);
        }

        if(!ArchiveConfig.fileNames.size) {
            ArchiveConfig.loadFileNames();
        }

        return ArchiveConfig.fileNames.get(nameHash) ?? undefined;
    }

    public static loadXteaKeys(): void {
        Xtea.loadKeys(path.join(ArchiveConfig.configPath, 'xtea'));
    }

    public static loadFileNames(): void {
        const configPath = path.join(ArchiveConfig.configPath, 'name-hashes.json');
        if(!fs.existsSync(configPath)) {
            logger.error(`Error loading file names: ${configPath} was not found.`);
            return;
        }

        try {
            const nameTable = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { [key: string]: string };
            Object.keys(nameTable).forEach(nameHash => ArchiveConfig.fileNames.set(Number(nameHash), nameTable[nameHash]));
        } catch(error) {
            logger.error(`Error loading file names:`, error);
        }
    }

    public static loadConfig(): void {
        const configPath = path.join(ArchiveConfig.configPath, 'archives.json5');
        if(!fs.existsSync(configPath)) {
            logger.error(`Error loading archive config: ${configPath} was not found.`);
            return;
        }

        try {
            const archiveInfo = JSON5.parse(fs.readFileSync(configPath, 'utf-8')) as { [key: string]: ArchiveDetails };
            const archiveNames = Object.keys(archiveInfo);
            for(const archiveName of archiveNames) {
                const archive = archiveInfo[archiveName];
                archive.name = archiveName;
                ArchiveConfig.configs.set(String(archive.index), archive);
            }
        } catch(error) {
            logger.error(`Error loading archive config:`, error);
        }
    }

    public static get configPath(): string {
        return ArchiveConfig._configPath;
    }

}
