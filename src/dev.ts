import { Js5Store } from './js5-store';
import path from 'path';


const store = new Js5Store(path.join('..', 'server', 'cache'), path.join('.', 'config'));
store.decode();
