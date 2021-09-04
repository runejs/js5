import * as fs from 'fs';
import path from 'path';
import JSON5 from 'json5';
import { logger } from '@runejs/core';


export type ArchiveContentType = 'groups' | 'files';


export interface ArchiveContentConfig {
    type?: ArchiveContentType;
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
    public readonly configs: Map<string, ArchiveInfo>;

    public constructor(configPath: string) {
        this.configPath = configPath;
        this.configs = new Map<string, ArchiveInfo>();
    }

    public get(archiveIndex: string): ArchiveInfo {
        if(!this.configs.size) {
            this.loadConfig();
        }

        return this.configs.get(archiveIndex);
    }

    public getArchiveGroupNames(archiveIndex: string): { [groupName: string]: number } {
        return this.get(archiveIndex)?.content?.defaultFileNames ?? {};
    }

    public getArchiveName(archiveIndex: string): string | undefined {
        return this.get(archiveIndex)?.name ?? undefined;
    }

    public getArchiveIndex(archiveName: string): string | undefined {
        for(const [ archiveIndex, archive ] of this.configs) {
            if(archive.name === archiveName) {
                return archiveIndex;
            }
        }

        return undefined;
    }

    public loadConfig(): void {
        const configFileName = 'archives.json5';
        const configPath = path.join(this.configPath, configFileName);
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
