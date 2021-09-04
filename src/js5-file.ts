import { Js5Archive } from './js5-archive';
import { Compression } from './compression/file-compression';
import { ByteBuffer } from '@runejs/core/buffer';
import { getFileNameForHash } from './hash/name-hash';
import Bzip2 from './compression/bzip2';
import Gzip from './compression/gzip';
import Xtea from './compression/xtea';
import { logger } from '@runejs/core';


export class Js5File {

    public readonly archive: Js5Archive;
    public readonly index: string;

    protected _compression: Compression;
    protected _crc32: number;
    protected _name: string;
    protected _version: number | undefined;
    protected _nameHash: number | undefined;
    protected _data: ByteBuffer | undefined;
    protected _compressed: boolean;
    protected _size: number;
    protected _sector: number;

    public constructor(index: string | number, archive?: Js5Archive) {
        this.archive = archive;
        this.index = typeof index === 'number' ? String(index) : index;
        this._data = null;
        this._compressed = true;
        this._name = '';
    }

    public compress(): ByteBuffer {
        if(this.compressed) {
            return this._data;
        }

        const decompressedData = this._data;
        let data: ByteBuffer;

        if(this.compression === Compression.uncompressed) {
            // uncompressed files
            data = new ByteBuffer(decompressedData.length + (!this.version ? 5 : 7));

            // indicate that no file compression is applied
            data.put(0);

            // write the uncompressed file length
            data.put(decompressedData.length, 'int');

            // write the uncompressed file data
            data.putBytes(decompressedData);
        } else {
            // compressed Bzip2 or Gzip file

            const compressedData: ByteBuffer = this.compression === Compression.bzip ?
                Bzip2.compress(decompressedData) : Gzip.compress(decompressedData);

            const compressedLength: number = compressedData.length;

            data = new ByteBuffer(compressedData.length + (!this.version ? 9 : 11));

            // indicate which type of file compression was used (1 or 2)
            data.put(this.compression);

            // write the compressed file length
            data.put(compressedLength, 'int');

            // write the uncompressed file length
            data.put(decompressedData.length, 'int');

            // write the compressed file data
            data.putBytes(compressedData);
        }

        if(data?.length) {
            if(this.version) {
                data.put(this.version, 'short');
            }

            this._data = data.flipWriter();
            this._compressed = true;
            this._data.readerIndex = 0;
            this._data.writerIndex = 0;
            return this._data;
        }
    }
    
    public decompress(keys?: number[]): ByteBuffer | null {
        if(!this.compressed) {
            return this._data;
        }

        const compressedData = this._data;
        
        if(!compressedData?.length) {
            return null;
        }

        compressedData.readerIndex = 0;

        this.compression = compressedData.get('byte', 'unsigned');
        const compressedLength = compressedData.get('int', 'unsigned');
        let data: ByteBuffer;

        if(Xtea.validKeys(keys)) {
            // Decode xtea encrypted file
            const readerIndex = compressedData.readerIndex;
            let lengthOffset = readerIndex;
            if(compressedData.length - (compressedLength + readerIndex + 4) >= 2) {
                lengthOffset += 2;
            }
            const decryptedData = Xtea.decrypt(compressedData, keys, compressedData.length - lengthOffset);
            decryptedData.copy(compressedData, readerIndex, 0);
            compressedData.readerIndex = readerIndex;
        }

        if(this.compression === Compression.uncompressed) {
            // Uncompressed file
            data = new ByteBuffer(compressedLength);
            compressedData.copy(data, 0, compressedData.readerIndex, compressedLength);
            compressedData.readerIndex = (compressedData.readerIndex + compressedLength);

            if(compressedData.readable >= 2) {
                this.version = compressedData.get('short', 'unsigned');
            }
        } else {
            // Compressed file
            const decompressedLength = compressedData.get('int', 'unsigned');
            if(decompressedLength < 0) {
                logger.error(`Invalid file length - missing XTEA keys?`);
                return null;
            }

            const decompressedData = new ByteBuffer(
                this.compression === Compression.bzip ? 
                    decompressedLength : (compressedData.length - compressedData.readerIndex + 2)
            );

            compressedData.copy(decompressedData, 0, compressedData.readerIndex);

            try {
                data = this.compression === Compression.bzip ?
                    Bzip2.decompress(decompressedData) : Gzip.decompress(decompressedData);

                compressedData.readerIndex = compressedData.readerIndex + compressedLength;

                if(data.length !== decompressedLength) {
                    logger.error(`Compression length mismatch`);
                    return null;
                }

                // Read the file footer
                if(compressedData.readable >= 2) {
                    this.version = compressedData.get('short', 'unsigned');
                }
            } catch(error) {
                logger.error(error?.message ?? error);
            }
        }

        if(data?.length) {
            this._data = data;
            this._compressed = false;
            this._data.readerIndex = 0;
            this._data.writerIndex = 0;
            return this._data;
        }

        return null;
    }

    public extractPackedFile(indexChannel: ByteBuffer, dataChannel: ByteBuffer): ByteBuffer {
        const indexDataLength = 6;

        let pointer = this.numericIndex * indexDataLength;
        if(pointer < 0 || pointer >= indexChannel.length) {
            throw new Error('File Not Found');
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if(fileIndexData.readable !== indexDataLength) {
            throw new Error(`Not Enough Readable Index Data: Buffer contains ${fileIndexData.readable} but needed ${indexDataLength}`);
        }

        this.size = fileIndexData.get('int24', 'unsigned');
        this.sector = fileIndexData.get('int24', 'unsigned');

        const data = new ByteBuffer(this.size);
        const sectorDataLength = 512;
        const fullSectorLength = 520;

        let chunk = 0, remaining = this.size;
        pointer = this.sector * fullSectorLength;

        do {
            const temp = new ByteBuffer(fullSectorLength);
            dataChannel.copy(temp, 0, pointer, pointer + fullSectorLength);

            if(temp.readable !== fullSectorLength) {
                throw new Error(`Not Enough Readable Sector Data: Buffer contains ${temp.readable} but needed ${fullSectorLength}`);
            }

            const sectorId = temp.get('short', 'unsigned');
            const sectorChunk = temp.get('short', 'unsigned');
            const nextSector = temp.get('int24', 'unsigned');
            const sectorIndex = temp.get('byte', 'unsigned');
            const sectorData = new ByteBuffer(sectorDataLength);
            temp.copy(sectorData, 0, temp.readerIndex, temp.readerIndex + sectorDataLength);

            if(remaining > sectorDataLength) {
                sectorData.copy(data, data.writerIndex, 0, sectorDataLength);
                data.writerIndex = (data.writerIndex + sectorDataLength);
                remaining -= sectorDataLength;

                if(sectorIndex !== this.archive.numericIndex) {
                    throw new Error('File type mismatch.');
                }

                if(sectorId !== this.numericIndex) {
                    throw new Error('File id mismatch.');
                }

                if(sectorChunk !== chunk++) {
                    throw new Error('Chunk mismatch.');
                }

                pointer = nextSector * fullSectorLength;
            } else {
                sectorData.copy(data, data.writerIndex, 0, remaining);
                data.writerIndex = (data.writerIndex + remaining);
                remaining = 0;
            }
        } while(remaining > 0);

        data.readerIndex = 0;
        this._data = data;
        this._data.readerIndex = 0;
        this._data.writerIndex = 0;
        this._compressed = true;
        return this._data;
    }

    public get numericIndex(): number {
        return Number(this.index);
    }
    
    public get compression(): Compression {
        return this._compression ?? this.archive.compression;
    }
    
    public set compression(compression: Compression) {
        this._compression = compression;
    }

    public get crc32(): number {
        return this._crc32;
    }

    public set crc32(value: number) {
        this._crc32 = value;
    }

    public get version(): number | undefined {
        return this._version;
    }

    public set version(value: number) {
        this._version = value;
    }

    public get nameHash(): number | undefined {
        return this._nameHash;
    }

    public set nameHash(nameHash: number) {
        this._nameHash = nameHash;
        this._name = getFileNameForHash(nameHash);
    }

    public get name(): string {
        return this._name;
    }

    public get data(): ByteBuffer {
        return this._data;
    }

    public get compressed(): boolean {
        return this._compressed;
    }

    public get size(): number {
        return this._size;
    }

    public set size(value: number) {
        this._size = value;
    }

    public get sector(): number {
        return this._sector;
    }

    public set sector(value: number) {
        this._sector = value;
    }
}
