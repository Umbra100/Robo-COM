import fs from 'node:fs/promises';
import fs2 from 'node:fs'
import { JSONFile } from './subsystems/Local/file-classes.mjs';
import { terminalFormatter } from './helper.mjs';

/**Class object containing the app config data. All config points are saved statically to the class on start */
var ConfigFile = new (class {})(), watcher, waiters = [];

/**JSON File wrapper of the config file */
export const ConfigJSON = new JSONFile('./config.json');

/**Gets the data from the json config file and saves it statically to the ConfigFile class @async*/
export const activate = async () => {
   //Gets and save the config data
   const data = JSON.parse(await fs.readFile('./config.json',{ encoding: 'utf8' }));
   for (const i in data){
      ConfigFile[i] = data[i];
   }

   //Creates a watcher event that's called when the config json file changes
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

/**Waits for the config file to update @async */
export const waitForChange = async () => new Promise((resolve,reject) => {
   waiters.push(() => {
      resolve();
   })
});

export default ConfigFile;
