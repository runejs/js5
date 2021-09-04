import { Js5Archive } from './js5-archive';
import { ByteBuffer } from '@runejs/core/buffer';
import path from 'path';
import * as fs from 'fs';
import { logger } from '@runejs/core';
import { ArchiveConfig } from './config/archive-config';


export class Js5Store {

    public readonly archiveConfig: ArchiveConfig;
    public readonly archives: Map<string, Js5Archive>;
    public readonly packedStorePath: string;
    public readonly configPath: string;

    public packedMainIndexChannel: ByteBuffer;
    public packedIndexChannels: Map<string, ByteBuffer>;
    public packedDataChannel: ByteBuffer;

    public constructor(packedStorePath: string, configPath: string) {
        this.packedStorePath = packedStorePath;
        this.configPath = configPath;
        this.archiveConfig = new ArchiveConfig(configPath);
        this.archives = new Map<string, Js5Archive>();
        this.packedIndexChannels = new Map<string, ByteBuffer>();
        this.readPackedStore();
    }

    public readPackedStore(): void {
        if(!fs.existsSync(this.packedStorePath)) {
            throw new Error(`${this.packedStorePath} could not be found.`);
        }

        const stats = fs.statSync(this.packedStorePath);
        if(!stats?.isDirectory()) {
            throw new Error(`${this.packedStorePath} is not a valid directory.`);
        }

        const storeFileNames = fs.readdirSync(this.packedStorePath);
        const dataFile = 'main_file_cache.dat2'; // @TODO support more
        const mainIndexFile = 'main_file_cache.idx255';

        if(storeFileNames.indexOf(dataFile) === -1) {
            throw new Error(`The main ${dataFile} data file could not be found.`);
        }

        if(storeFileNames.indexOf(mainIndexFile) === -1) {
            throw new Error(`The main ${mainIndexFile} index file could not be found.`);
        }

        const indexFilePrefix = 'main_file_cache.idx';
        const dataFilePath = path.join(this.packedStorePath, dataFile);
        const mainIndexFilePath = path.join(this.packedStorePath, mainIndexFile);

        this.packedDataChannel = new ByteBuffer(fs.readFileSync(dataFilePath));
        this.packedMainIndexChannel = new ByteBuffer(fs.readFileSync(mainIndexFilePath));

        const mainArchive = new Js5Archive(this, 255);
        this.archives.set('255', mainArchive);

        for(const fileName of storeFileNames) {
            if(!fileName?.length || fileName === mainIndexFile || fileName === dataFile) {
                continue;
            }

            if(!fileName.startsWith(indexFilePrefix)) {
                continue;
            }

            const index = fileName.substring(fileName.indexOf('.idx') + 4);
            const numericIndex = Number(index);

            if(isNaN(numericIndex)) {
                logger.error(`Index file ${fileName} does not have a valid extension.`);
            }

            const fileData = new ByteBuffer(fs.readFileSync(path.join(this.packedStorePath, fileName)));
            this.packedIndexChannels.set(index, fileData);
            this.archives.set(index, new Js5Archive(this, numericIndex, mainArchive));
        }

        for(const [ , archive ] of this.archives) {
            archive.decode();
        }
    }

}
