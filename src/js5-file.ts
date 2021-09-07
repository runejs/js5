import { ByteBuffer } from '@runejs/core/buffer';
import { Compression } from '@runejs/core/compression';
import { Js5Store } from './js5-store';
import { Js5Archive } from './js5-archive';
import { StoreFileBase } from './store-file-base';
import { logger } from '@runejs/core';


export class Js5File extends StoreFileBase {

    public readonly store: Js5Store;
    public readonly archive: Js5Archive;

    protected _sector: number;

    public constructor(index: string | number, store: Js5Store);
    public constructor(index: string | number, archive: Js5Archive);
    public constructor(index: string | number, store: Js5Store, archive: Js5Archive);
    public constructor(index: string | number, arg1: Js5Store | Js5Archive, arg2?: Js5Archive) {
        super(index);

        let store: Js5Store;
        let archive: Js5Archive;
        if(arg1 instanceof Js5Archive) {
            archive = arg1;
            store = arg1.store;
        } else {
            store = arg1;
            archive = arg2;
        }

        this.store = store;
        this.archive = archive;
        this._name = this.index;
        this.setData(null, true);
    }

    public decompress(): ByteBuffer | null {
        const encryption = !this.store.xteaDisabled ? (this.archive?.details?.content?.encryption ?? 'none') : 'none';
        return super.decompress(encryption);
    }

    public extractPackedFile(indexChannel: ByteBuffer, dataChannel: ByteBuffer): ByteBuffer | null {
        const indexDataLength = 6;

        let pointer = this.numericIndex * indexDataLength;
        if(pointer < 0 || pointer >= indexChannel.length) {
            if(this.archive) {
                logger.error(`File ${this.index} was not found within the packed ${this.archive.name} archive index file.`);
            } else {
                logger.error(`File ${this.index} was not found within the provided index file.`);
            }
            return null;
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if(fileIndexData.readable !== indexDataLength) {
            logger.error(`Error reading packed file ${this.index}, the end of the data stream was reached.`);
            return null;
        }

        this.size = fileIndexData.get('int24', 'unsigned');
        this.sector = fileIndexData.get('int24', 'unsigned');

        const data = new ByteBuffer(this.size);
        const sectorDataLength = 512;
        const fullSectorLength = 520;

        let sector = 0, remaining = this.size;
        pointer = this.sector * fullSectorLength;

        do {
            const temp = new ByteBuffer(fullSectorLength);
            dataChannel.copy(temp, 0, pointer, pointer + fullSectorLength);

            if(temp.readable !== fullSectorLength) {
                logger.error(`Error reading sector for packed file ${this.index}, the end of the data stream was reached.`);
                return null;
            }

            const sectorFileIndex = temp.get('short', 'unsigned');
            const currentSector = temp.get('short', 'unsigned');
            const nextSector = temp.get('int24', 'unsigned');
            const sectorArchiveIndex = temp.get('byte', 'unsigned');
            const sectorData = new ByteBuffer(sectorDataLength);
            temp.copy(sectorData, 0, temp.readerIndex, temp.readerIndex + sectorDataLength);

            if(remaining > sectorDataLength) {
                sectorData.copy(data, data.writerIndex, 0, sectorDataLength);
                data.writerIndex = (data.writerIndex + sectorDataLength);
                remaining -= sectorDataLength;

                if(this.archive && sectorArchiveIndex !== this.archive.numericIndex) {
                    logger.error(`Packed file ${this.index}'s archive index does not match. ` +
                        `Expected ${this.archive.index} but received ${sectorFileIndex}`);
                    return null;
                }

                if(sectorFileIndex !== this.numericIndex) {
                    logger.error(`Packed file ${this.index} does not match read index ${sectorFileIndex}.`);
                    return null;
                }

                if(currentSector !== sector++) {
                    logger.error(`Error loading packed file ${this.index}, unable to locate all file sectors.`);
                    return null;
                }

                pointer = nextSector * fullSectorLength;
            } else {
                sectorData.copy(data, data.writerIndex, 0, remaining);
                data.writerIndex = (data.writerIndex + remaining);
                remaining = 0;
            }
        } while(remaining > 0);

        this.setData(data, true);
        return this._data;
    }

    public get compression(): Compression {
        return this._compression ?? this.archive?.compression ?? Compression.uncompressed;
    }

    public set compression(compression: Compression) {
        this._compression = compression;
    }

    public get sector(): number {
        return this._sector;
    }

    public set sector(value: number) {
        this._sector = value;
    }
}
