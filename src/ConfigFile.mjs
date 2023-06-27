import fs from 'node:fs/promises';
import fs2 from 'node:fs'
import { JSONFile } from './subsystems/Local/file-classes.mjs';
import { terminalFormatter } from './helper.mjs';

var ConfigFile = new (class {})(), watcher, waiters = [];

export const ConfigJSON = new JSONFile('./config.json');

export const activate = async () => {
   const data = JSON.parse(await fs.readFile('./config.json',{ encoding: 'utf8' }));
   for (const i in data){
      ConfigFile[i] = data[i];
   }

   watcher = fs2.watchFile('./config.json',async () => {
      const data = JSON.parse(await fs.readFile('./config.json',{ encoding: 'utf8' }));
      for (const i in data){
         ConfigFile[i] = data[i];
      }
      for (const func of waiters) func();
      waiters = [];
      console.log(terminalFormatter.bulletPoint, 'Config File Updated');
   });
}

export const waitForChange = async () => new Promise((resolve,reject) => {
   waiters.push(() => {
      resolve();
   })
});

export default ConfigFile;
