import * as fs from 'fs';
import path from 'path';
import JSON5 from 'json5';
import { logger } from '@runejs/core';
import { Xtea, XteaKeys } from '@runejs/core/encryption';


export type ArchiveContentType = 'groups' | 'files';


export type EncryptionMethod = 'none' | 'xtea';


export interface ArchiveContentDetails {
    type?: ArchiveContentType;
    encryption?: EncryptionMethod;
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


export class StoreConfig {

    public static gameVersion: number | undefined;

    private static _configPath: string;

    private static readonly archives: Map<string, ArchiveDetails> = new Map<string, ArchiveDetails>();
    private static readonly fileNames: Map<number, string> = new Map<number, string>();
    private static readonly xteaKeys: Map<string, XteaKeys[]> = new Map<string, XteaKeys[]>();

    public static register(configPath: string, gameVersion?: number | undefined): void {
        StoreConfig._configPath = configPath;
        StoreConfig.gameVersion = gameVersion;
    }

    public static getXteaKey(fileName: string): XteaKeys | XteaKeys[] | null {
        if(!StoreConfig.xteaKeys.size) {
            StoreConfig.loadXteaKeys();
        }

        if(!StoreConfig.xteaKeys.size) {
            logger.error(`XTEA keys could not be loaded.`);
            return null;
        }

        const keySets = StoreConfig.xteaKeys.get(fileName);
        if(!keySets) {
            return null;
        }

        if(StoreConfig.gameVersion !== undefined) {
            return keySets.find(keySet => keySet.gameVersion === StoreConfig.gameVersion) ?? null;
        }

        return keySets;
    }

    public static getArchiveDetails(archiveIndex: string): ArchiveDetails {
        if(!StoreConfig.archives.size) {
            StoreConfig.loadConfig();
        }

        return StoreConfig.archives.get(archiveIndex);
    }

    public static getArchiveGroupNames(archiveIndex: string): { [groupName: string]: number } {
        return StoreConfig.getArchiveDetails(archiveIndex)?.content?.defaultFileNames ?? {};
    }

    public static getArchiveName(archiveIndex: string): string | undefined {
        return StoreConfig.getArchiveDetails(archiveIndex)?.name ?? undefined;
    }

    public static getArchiveIndex(archiveName: string): string | undefined {
        for(const [ archiveIndex, archive ] of StoreConfig.archives) {
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

        if(!StoreConfig.fileNames.size) {
            StoreConfig.loadFileNames();
        }

        return StoreConfig.fileNames.get(nameHash) ?? undefined;
    }

    public static loadXteaKeys(): void {
        Xtea.loadKeys(path.join(StoreConfig.configPath, 'xtea'));
    }

    public static loadFileNames(): void {
        const configPath = path.join(StoreConfig.configPath, 'name-hashes.json');
        if(!fs.existsSync(configPath)) {
            logger.error(`Error loading file names: ${configPath} was not found.`);
            return;
        }

        try {
            const nameTable = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { [key: string]: string };
            Object.keys(nameTable).forEach(nameHash => StoreConfig.fileNames.set(Number(nameHash), nameTable[nameHash]));
        } catch(error) {
            logger.error(`Error loading file names:`, error);
        }
    }

    public static loadConfig(): void {
        const configPath = path.join(StoreConfig.configPath, 'archives.json5');
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
                StoreConfig.archives.set(String(archive.index), archive);
            }
        } catch(error) {
            logger.error(`Error loading archive config:`, error);
        }
    }

    public static get configPath(): string {
        return StoreConfig._configPath;
    }

}
