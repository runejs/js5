import { ByteBuffer } from '@runejs/core/buffer';
import { Compression } from '@runejs/core/compression';
import { StoreConfig } from './config';


export abstract class IndexedFile {

    public readonly index: string;

    protected _compression: Compression;
    protected _crc32: number;
    protected _name: string;
    protected _version: number | undefined;
    protected _nameHash: number | undefined;
    protected _data: ByteBuffer | undefined;
    protected _compressed: boolean;
    protected _size: number;

    protected constructor(index: string | number) {
        this.index = typeof index === 'number' ? String(index) : index;
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

    public get numericIndex(): number {
        return Number(this.index);
    }

    public get compression(): Compression {
        return this._compression ?? Compression.uncompressed;
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
        this._name = StoreConfig.getFileName(nameHash);
    }

    public get name(): string {
        return this._name;
    }

    public set name(name: string) {
        this._name = name;
        this._nameHash = StoreConfig.hashFileName(name);
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

}
