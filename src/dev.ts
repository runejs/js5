import path from 'path';
import { Js5Store } from './js5-store';
import { Crc32 } from './crc32';


const store = new Js5Store({
    storePath: path.join('..', 'store'),
    gameVersion: 435
});

// store.decode();

const binaryArchive = store.findArchive('binary');
binaryArchive.decode();

/*const titleJpg = binaryArchive.findGroup('title.jpg');

console.log(titleJpg.crc32);

titleJpg.decompress();
titleJpg.compress();

console.log(Crc32.calculateCrc(0, titleJpg.size, titleJpg.data));
*/
