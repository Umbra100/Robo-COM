import { JSONFile } from "./subsystems/Local/file-classes.mjs";

const EngineeringNotebook = new (class extends JSONFile {
   #fileClass
   constructor(filepath){
      super(filepath);
      this.#fileClass = new JSONFile(filepath);
      this.individualIndex = {};
      this.teamIndex = [];
   }
   /**Updates the notebook index. The index is used to tell whether a date exists and who has made an individual note for it without reading from file
    * @param {Object} using Data to override the engineering notebook data. It will update based on this rather than the file
    * @async
    * @returns {void}
    */
   async updateIndex(using){
      if (typeof using !== 'undefined') for (const i in using){
         this.individualIndex[i] = using[i].individual.map(j => j.id);
         if (using[i].team !== null) this.teamIndex.push(i);
      } else {
         const read = await this.read();
         for (const i in read){
            this.individualIndex[i] = read[i].individual.map(j => j.id);
            if (read[i].team !== null) this.teamIndex.push(i);
         }
      }
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
      const read = await this.read();
      await this.updateIndex(read);
      return read;
   }
   /**
    * Overwrites JSON file to a provided object.
    * @async
    * @param {Object} data Data to completely overwrite JSON file. File JSON object will be set to the data; no appendation is done.
    * @param {Boolean} [parse] Whether or not to parse the JSON data it writes/returns
    * @returns {Object} Overwritten data
    */
   async write(data,parse = true){
      const read = await this.#fileClass.write(data,parse);
      await this.updateIndex(read);
      return read;
   }
})('./data/engineering_notebook.json');

export default EngineeringNotebook;
