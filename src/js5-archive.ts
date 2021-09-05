import { Js5Store } from './js5-store';
import { Js5FileGroup } from './js5-file-group';
import { Js5File } from './js5-file';
import { logger } from '@runejs/core';
import { ArchiveInfo } from './config/archive-config';
import { plurality } from './util/string';


export class Js5Archive extends Js5File {

    public readonly groups: Map<string, Js5FileGroup>;
    public readonly config: ArchiveInfo;

    private _format: number;
    private _filesNamed: boolean;

    public constructor(js5Store: Js5Store, index: string | number, archive?: Js5Archive) {
        super(index, js5Store, archive);
        this.groups = new Map<string, Js5FileGroup>();
        this.config = js5Store.config.getArchiveInfo(this.index);
    }

    public decode(): void {
        this._nameHash = this.store.config.hashFileName(this.config.name);
        this._name = this.config.name;

        if(this.index === '255') {
            return;
        }

        logger.info(`Decoding archive ${this.name}...`);

        this.extractPackedFile(this.store.packedMainIndexChannel, this.store.packedDataChannel);

        const archiveData = this.decompress();

        if(!archiveData?.length) {
            logger.error(`Error decompressing file data.`);
            return;
        }

        this.format = archiveData.get('byte', 'unsigned');
        this.filesNamed = (archiveData.get('byte', 'unsigned') & 0x01) !== 0;

        const fileCount = archiveData.get('short', 'unsigned');
        const groupIndices: number[] = new Array(fileCount);
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

        let successes = 0;
        let failures = 0;

        if(this.groups.size) {
            for(const [ , group ] of this.groups) {
                try {
                    group?.decode();

                    if(group?.data?.length && !group.compressed) {
                        successes++;
                    } else {
                        failures++;
                    }
                } catch(error) {
                    logger.error(error);
                    failures++;
                }
            }
        }

        if(successes) {
            logger.info(`${fileCount} ${plurality('file', fileCount)} were found, ` +
                `${successes} decompressed successfully.`);
        } else {
            logger.info(`${fileCount} ${plurality('file', fileCount)} were found.`);
        }

        if(failures) {
            logger.error(`${failures} ${plurality('file', failures)} failed to decompress.`);
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
