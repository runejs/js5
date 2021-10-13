import path from 'path';
import { Js5Store } from './js5-store';


const store = new Js5Store({
    storePath: path.join('..', 'store'),
    gameVersion: 462,
    // gameVersion: 435,
});

store.decode();

const mapsArchive = store.findArchive('maps');

// mapsArchive.decode();

const landscape = mapsArchive.findGroup('l32_58');
console.log(landscape.encoded);

// const binaryArchive = store.findArchive('binary');
// binaryArchive.decode();

/*const titleJpg = binaryArchive.findGroup('title.jpg');

console.log(titleJpg.crc32);

titleJpg.decompress();
titleJpg.compress();

console.log(Crc32.calculateCrc(0, titleJpg.size, titleJpg.data));
*/
