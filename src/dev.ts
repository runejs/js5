import { Js5Store } from './js5-store';
import path from 'path';


const store = new Js5Store({
    storePath: path.join('..', 'store')
});

store.getArchive('anims').decode();
