import { Js5File } from './js5-file';
import { Js5Archive } from './js5-archive';
import { logger } from '@runejs/core';
import { ByteBuffer } from '@runejs/core/buffer';


export class Js5FileGroup extends Js5File {

    public readonly files: Map<string, Js5File>;

    private _encoded: boolean;

    public constructor(index: string | number, archive: Js5Archive) {
        super(index, archive);
        this.files = new Map<string, Js5File>();
        this._encoded = true;
    }

    public decode(): void {
        if(!this._encoded) {
            return;
        }

        if(!this._data?.length) {
            const js5Store = this.archive.store;
            this.extractPackedFile(js5Store.packedIndexChannels.get(this.archive.index), js5Store.packedDataChannel);
        }

        if(this.compressed) {
            this.decompress();
        }

        if(this.files.size === 1) {
            const onlyChild: Js5File = Array.from(this.files.values())[0];
            onlyChild.nameHash = this.nameHash;
            onlyChild.setData(this._data, this.compressed);
        } else {
            const dataLength = this._data?.length ?? 0;

            if(!dataLength) {
                logger.error(`Error decoding group ${this.index}`);
                return;
            }

            this._data.readerIndex = (dataLength - 1);

            const stripeCount = this._data.get('byte', 'unsigned');

            const stripeLengths: Map<string, number>[] = new Array(stripeCount);
            const sizes: Map<string, number> = new Map<string, number>();

            this._data.readerIndex = (dataLength - 1 - stripeCount * this.files.size * 4);

            for(let stripe = 0; stripe < stripeCount; stripe++) {
                let currentLength = 0;
                for(const [ fileIndex, ] of this.files) {
                    const stripeLength = this._data.get('int');
                    currentLength += stripeLength;

                    if(!stripeLengths[stripe]) {
                        stripeLengths[stripe] = new Map<string, number>();
                    }

                    stripeLengths[stripe].set(fileIndex, currentLength);
                    sizes.set(fileIndex, (sizes.get(fileIndex) ?? 0) + currentLength);
                }
            }

            for(const [ fileIndex, file ] of this.files) {
                file?.setData(new ByteBuffer(sizes.get(fileIndex) ?? 0), false);
            }

            this._data.readerIndex = 0;

            for(let stripe = 0; stripe < stripeCount; stripe++) {
                for(const [ fileIndex, file ] of this.files) {
                    const stripeLength = stripeLengths[stripe].get(fileIndex);
                    if(!stripeLength) {
                        continue;
                    }

                    file?.data?.putBytes(this._data.getSlice(this._data.readerIndex, stripeLength));

                    let sourceEnd: number = this._data.readerIndex + stripeLength;
                    if(this._data.readerIndex + stripeLength >= this._data.length) {
                        sourceEnd = this._data.length;
                    }

                    if(file?.data) {
                        this._data.copy(file.data, 0, this._data.readerIndex, sourceEnd);
                    }

                    this._data.readerIndex = sourceEnd;
                }
            }
        }

        this._encoded = false;
    }

    /**
     * Adds a new or replaces an existing file within the group.
     * @param fileIndex The index of the file to add or change.
     * @param file The file to add or change.
     */
    public setFile(fileIndex: number | string, file: Js5File): void {
        this.files.set(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex, file);
    }

    /**
     * Fetches a file from this group by index.
     * @param fileIndex The index of the file to find.
     */
    public getFile(fileIndex: number | string): Js5File | null {
        return this.files.get(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex) ?? null;
    }

    public get encoded(): boolean {
        return this._encoded;
    }
}
