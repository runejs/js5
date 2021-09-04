/**
 * Djb2 file name lookup table.
 */
export const fileNames: { [key: string]: string | null } = require('../../config/name-hashes.json');


/**
 * Fetches a specific file name based off of it's Djb2 hash.
 * This does not decode the Djb2 hash, it only references the known lookup table to try and find a match.
 * If a match is not found, the stringified version of the name hash is returned. If the hash is invalid,
 * the string `'undefined'` is returned.
 * @param nameHash The Djb2 hash to find the name for.
 */
export const getFileNameForHash = (nameHash: number): string | null => {
    if(nameHash === undefined) {
        return null;
    }

    const hashString = String(nameHash);

    return fileNames[hashString] ?? hashString ?? 'undefined';
};


export const hashFileName = (str: string): number => {
    let hash = 0;

    for(let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    return hash | 0;
};
