import { Js5File } from './js5-file';
import { Js5Archive } from './js5-archive';


export class Js5FileGroup extends Js5File {

    public readonly files: Map<string, Js5File>;

    private _encoded: boolean;

    public constructor(index: string | number, archive: Js5Archive) {
        super(index, archive);
        this.files = new Map<string, Js5File>();
        this._encoded = true;
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
