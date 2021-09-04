import { Js5Store } from './js5-store';
import { Js5FileGroup } from './js5-file-group';
import { Js5File } from './js5-file';
import { logger } from '@runejs/core';
import { ArchiveInfo } from './config/archive-config';


export class Js5Archive extends Js5File {

    public readonly js5Store: Js5Store;
    public readonly groups: Map<string, Js5FileGroup>;
    public readonly config: ArchiveInfo;

    private _format: number;
    private _filesNamed: boolean;

    public constructor(js5Store: Js5Store, index: string | number, archive?: Js5Archive) {
        super(index, archive);
        this.js5Store = js5Store;
        this.groups = new Map<string, Js5FileGroup>();
        this.config = js5Store.archiveConfig.getArchiveInfo(this.index);
    }

    public decode(): void {
        this._nameHash = this.js5Store.archiveConfig.hashFileName(this.config.name);
        this._name = this.config.name;

        if(this.index === '255') {
            return;
        }

        logger.info(`Decoding archive ${this.name}...`);

        this.extractPackedFile(this.js5Store.packedMainIndexChannel, this.js5Store.packedDataChannel);

        const archiveData = this.decompress();

        if(!archiveData?.length) {
            logger.error(`Error decompressing file data.`);
            return;
        }

        this.format = archiveData.get('byte', 'unsigned');
        this.filesNamed = (archiveData.get('byte', 'unsigned') & 0x01) !== 0;

        const fileCount = archiveData.get('short', 'unsigned');

        const groupIndices: number[] = new Array(fileCount);

        logger.info(`${fileCount} file(s) found.`);

        let accumulator = 0;
        for(let i = 0; i < fileCount; i++) {
            const delta = archiveData.get('short', 'unsigned');
            groupIndices[i] = accumulator += delta;
            this.setGroup(groupIndices[i], new Js5FileGroup(groupIndices[i], this));
        }

        if(this.filesNamed) {
            for(const groupIndex of groupIndices) {
                this.getGroup(groupIndex).nameHash = archiveData.get('int');
            }
        }

        /* read the crc values */
        for(const groupIndex of groupIndices) {
            this.getGroup(groupIndex).crc32 = archiveData.get('int');
        }

        /* read the version numbers */
        for(const groupIndex of groupIndices) {
            this.getGroup(groupIndex).version = archiveData.get('int');
        }

        /* read the child count */
        const groupChildCounts: Map<number, number> = new Map<number, number>();

        for(const groupIndex of groupIndices) {
            // group file count
            groupChildCounts.set(groupIndex, archiveData.get('short', 'unsigned'));
        }

        /* read the file groupIndices */
        for(const groupIndex of groupIndices) {
            const group = this.getGroup(groupIndex);
            const fileCount = groupChildCounts.get(groupIndex);

            accumulator = 0;
            for(let i = 0; i < fileCount; i++) {
                const delta = archiveData.get('short', 'unsigned');
                const childFileIndex = accumulator += delta;
                group.setFile(childFileIndex, new Js5File(childFileIndex, this));
            }
        }

        /* read the child name hashes */
        if(this.filesNamed) {
            for(const groupIndex of groupIndices) {
                const fileGroup = this.getGroup(groupIndex);

                for(const [ , childFile ] of fileGroup.files) {
                    const nameHash = archiveData.get('int');
                    if(childFile) {
                        childFile.nameHash = nameHash;
                    }
                }
            }
        }

        if(this.groups.size) {
            for(const [ , group ] of this.groups) {
                group?.decode();
            }
        }
    }

    /**
     * Adds a new or replaces an existing group within the archive.
     * @param fileIndex The index of the group to add or change.
     * @param group The group to add or change.
     */
    public setGroup(fileIndex: number | string, group: Js5FileGroup): void {
        this.groups.set(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex, group);
    }

    /**
     * Fetches a group from this archive by index.
     * @param fileIndex The index of the group to find.
     */
    public getGroup(fileIndex: number | string): Js5FileGroup {
        return this.groups.get(typeof fileIndex === 'number' ? String(fileIndex) : fileIndex);
    }

    public get format(): number {
        return this._format;
    }

    public set format(value: number) {
        this._format = value;
    }

    public get filesNamed(): boolean {
        return this._filesNamed;
    }

    public set filesNamed(value: boolean) {
        this._filesNamed = value;
    }

}
