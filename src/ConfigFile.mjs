import { JSONFile } from './subsystems/Local/file-classes.mjs';
import { terminalFormatter } from './helper.mjs';

/**Class object containing the app config data. All config points are saved statically to the class on start */
var ConfigFile = new (class {})(), watcher, waiters = [];

/**JSON File wrapper of the config file */
export const ConfigJSON = new (class extends JSONFile {
   #fileClass
   constructor(filepath){
      super(filepath);
      this.#fileClass = new JSONFile(filepath);
   }
   /**
       * Overwrite a specific path in the JSON json file.
       * @async
       * @param {String} path JS syntax path in a string to target JSON object node of JSON file to write
       * @param {Object} data Value to set location of JSON path to
       * @param {Object} [options] Writing options for node
       *    @param {String} options.action Action specify how to the data is stored ('set' | 'append' | 'prepend' | 'delete')
       *    @param {Boolean} [options.parse] Whether or not to parse JSON data into Javascript object data type
       * @returns {any} Overwritten data at node
       */
   async writePath(path,data,options = {action: 'set', parse: true}){
      await this.#fileClass.writePath(path,data,options);
      var upd = await updateConfig();
      console.log(terminalFormatter.bulletPoint,'Config File Updated');
      return upd;
   }
   /**
    * Overwrites JSON file to a provided object.
    * @async
    * @param {Object} data Data to completely overwrite JSON file. File JSON object will be set to the data; no appendation is done.
    * @param {Boolean} [parse] Whether or not to parse the JSON data it writes/returns
    * @returns {Object} Overwritten data
    */
   async write(data,parse = true){
      await this.#fileClass.write(data,parse);
      var upd = await updateConfig();
      console.log(terminalFormatter.bulletPoint,'Config File Updated');
      return upd;
   }
})('./config.json');

export const updateConfig = async () => {
   const read = await ConfigJSON.read();
   for (const i in read){
      ConfigFile[i] = read[i];
   }
   return read;
}

export default ConfigFile;
