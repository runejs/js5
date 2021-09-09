import { Js5Store } from './js5-store';
import path from 'path';


const store = new Js5Store({
    storePath: path.join('..', 'server', 'cache'),
    configPath: path.join('.', 'config')
});

store.getArchive('anims').decode();
