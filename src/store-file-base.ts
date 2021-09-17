import { ByteBuffer } from '@runejs/common/buffer';
import { Xtea, XteaKeys } from '@runejs/common/encryption';
import { Bzip2, FileCompression, Gzip } from '@runejs/common/compression';
import { EncryptionMethod, StoreConfig } from './config';
import { createHash } from 'crypto';
import { logger } from '@runejs/common';
import { Crc32 } from './crc32';


export abstract class StoreFileBase {

    public readonly index: string;

    protected _data: ByteBuffer | undefined;
    protected _compression: FileCompression;
    protected _compressed: boolean;
    protected _name: string;
    protected _nameHash: number | undefined;
    protected _version: number | undefined;
    protected _size: number;
    protected _stripeCount: number;
    protected _stripeSizes: number[];
    protected _crc32: number;
    protected _sha256: string;

    protected constructor(index: string | number) {
        this.index = typeof index === 'number' ? String(index) : index;
        this._version = 0;
        this._size = 0;
    }

    public compress(): ByteBuffer {
        if(this.compressed) {
            return this._data;
        }

        const decompressedData = this._data;
        let data: ByteBuffer;

        if(this.compression === FileCompression.none) {
            // uncompressed files
            data = new ByteBuffer(decompressedData.length + 5);

            // indicate that no file compression is applied
            data.put(0);

            // write the uncompressed file length
            data.put(decompressedData.length, 'int');

            // write the uncompressed file data
            data.putBytes(decompressedData);
        } else {
            // compressed Bzip2 or Gzip file

            const compressedData: ByteBuffer = this.compression === FileCompression.bzip ?
                Bzip2.compress(decompressedData) : Gzip.compress(decompressedData);

            const compressedLength: number = compressedData.length;

            data = new ByteBuffer(compressedData.length + 9);

            // indicate which type of file compression was used (1 or 2)
            data.put(this.compression);

            // write the compressed file length
            data.put(compressedLength, 'int');

            // write the uncompressed file length
            data.put(decompressedData.length, 'int');

            // write the compressed file data
            data.putBytes(compressedData);
        }

        this.setData(data.flipWriter(), true);
        return this._data;
    }

    public decompress(encryption: EncryptionMethod = 'none'): ByteBuffer | null {
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

        const readerIndex = compressedData.readerIndex;
        let decodedDataSets: ByteBuffer[] = [];

        if(encryption === 'xtea') {
            let keySets: XteaKeys[] = [];
            if(this.name) {
                const loadedKeys = StoreConfig.getXteaKey(this.name);
                if(loadedKeys) {
                    if(!Array.isArray(loadedKeys)) {
                        keySets = [ loadedKeys ];
                    } else {
                        keySets = loadedKeys;
                    }
                }
            }

            for(const keys of keySets) {
                if(!Xtea.validKeys(keys.key)) {
                    continue;
                }

                const dataCopy = new ByteBuffer(compressedData.length);
                compressedData.copy(dataCopy, 0, 0);
                dataCopy.readerIndex = readerIndex;

                let lengthOffset = readerIndex;
                if(dataCopy.length - (compressedLength + readerIndex + 4) >= 2) {
                    lengthOffset += 2;
                }

                const decryptedData = Xtea.decrypt(dataCopy, keys.key, dataCopy.length - lengthOffset);
                decryptedData.copy(dataCopy, readerIndex, 0);
                decodedDataSets.push(dataCopy);
            }

            if(!keySets?.length) {
                decodedDataSets = [ compressedData ];
            }
        } else {
            decodedDataSets = [ compressedData ];
        }

        let data: ByteBuffer;

        for(const decodedData of decodedDataSets) {
            decodedData.readerIndex = readerIndex;

            if(this.compression === FileCompression.none) {
                // Uncompressed file
                data = new ByteBuffer(compressedLength);
                decodedData.copy(data, 0, decodedData.readerIndex, compressedLength);
                decodedData.readerIndex = (decodedData.readerIndex + compressedLength);

                // Read the file footer
                if(decodedData.readable >= 2) {
                    this.version = decodedData.get('short', 'unsigned');
                }
            } else {
                // Compressed file
                const decompressedLength = decodedData.get('int', 'unsigned');
                if(decompressedLength < 0) {
                    // logger.error(`Invalid file length - missing XTEA keys?`);
                    continue;
                }

                const decompressedData = new ByteBuffer(
                    this.compression === FileCompression.bzip ?
                        decompressedLength : (decodedData.length - decodedData.readerIndex + 2)
                );

                decodedData.copy(decompressedData, 0, decodedData.readerIndex);

                try {
                    data = this.compression === FileCompression.bzip ?
                        Bzip2.decompress(decompressedData) : Gzip.decompress(decompressedData);

                    decodedData.readerIndex = decodedData.readerIndex + compressedLength;

                    if(data.length !== decompressedLength) {
                        // logger.error(`Compression length mismatch`);
                    }

                    // Read the file footer
                    if(decodedData.readable >= 2) {
                        this.version = decodedData.get('short', 'unsigned');
                    }
                } catch(error) {
                    // logger.error(`Error decompressing file: ${error?.message ?? error}`);
                }
            }
        }

        if(data?.length) {
            this.setData(data, false);
            return this._data;
        }

        return null;
    }

    public setData(data: ByteBuffer, compressed: boolean): void {
        if(data?.length) {
            data.readerIndex = 0;
            data.writerIndex = 0;
            this._data = data;
        } else {
            this._data = null;
        }
        this._compressed = compressed;
        this._size = data?.length ?? 0;
    }

    public generateCrc32(): number | undefined {
        this._crc32 = !this.empty ? Crc32.calculateCrc(0, this.size, this._data) : undefined;
        return this._crc32;
    }

    public generateSha256(): string | undefined {
        this._sha256 = !this.empty ? createHash('sha256').update(this._data).digest('hex') : undefined;
        return this._sha256;
    }

    public get numericIndex(): number {
        return Number(this.index);
    }

    public get compression(): FileCompression {
        return this._compression ?? FileCompression.none;
    }

    public set compression(compression: FileCompression) {
        this._compression = compression;
    }

    public get crc32(): number {
        return this._crc32;
    }

    public set crc32(value: number) {
        this._crc32 = value;
    }

    public get sha256(): string {
        return this._sha256;
    }

    public set sha256(value: string) {
        this._sha256 = value;
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
        if(nameHash) {
            this._name = StoreConfig.getFileName(nameHash);
        }
    }

    public get name(): string {
        return this._name;
    }

    public set name(name: string) {
        this._name = name;
        if(name) {
            this._nameHash = StoreConfig.hashFileName(name);
        }
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

    public get empty(): boolean {
        return !this._data?.length;
    }

    public get stripeCount(): number {
        return this._stripeCount;
    }

    public set stripeCount(value: number) {
        this._stripeCount = value;
    }

    public get stripeSizes(): number[] {
        return this._stripeSizes;
    }

    public set stripeSizes(value: number[]) {
        this._stripeSizes = value;
    }
}
