import fs from 'node:fs/promises';
import path from 'node:path';
import { TXTFile, JSONFile } from './file-classes.mjs';
import { clockFormatter, terminalFormatter } from '../../helper.mjs';

class LogManifest {
   /**
    * Creates a wrapper of the entire log file directory
    * @param {Object} options Options to dictate how the log manifest behaves
    * @param {String} options.directory Log file directory to manipulate
    * @param {Number} options.interval Log file creation interval (in milliseconds)
    * @async
    */
   #intervalMeta
   constructor(options = {directory: undefined, interval: undefined}){
      return Promise.resolve(options)
         .then(async options => {
            if (typeof options.directory !== 'string') throw new TypeError(`Expected type 'string', recieved '${typeof options.directory}'`);
            if (typeof options.interval !== 'number') throw new TypeError(`Expected type 'number', recieved '${typeof options.interval}'`);
            
            this.directory = options.directory;

            //Gets the directory data of the log directory; if there is no metadata file throw an error
            var dir = await fs.readdir(this.directory,{encoding: 'utf8'});
            if (dir.indexOf('meta.json') == -1) throw new Error(`Log directory must contain a meta JSON file containing metadata of log files`);
            dir.splice(dir.indexOf('meta.json'),1);

            /**Wrapper for the metadata file in the log system*/
            this.metadata = new LogMetaFile(`${this.directory}/meta.json`);
            const data = await this.metadata.read();
            
            /**All log files in the system */
            this.files = {};
            for (const i in data.files){
               this.files[i] = new LogFile(`${this.directory}/${i}`);
            }

            /**Current log file that's in use. Use this for any logs made to the system */
            this.currentFile = new LogFile(`${this.directory}/${data.currentFile}`);

            /**Local interval meta data */
            this.#intervalMeta = {
               timeDelay: options.interval,
               active: false,
               functionDelay: 100,
               function: null,
               initializationDate: null
            };
            this.#intervalMeta.function = setInterval(async () => {await this.#intervalEvent();},this.#intervalMeta.functionDelay);
            this.#intervalMeta.initializationDate = Date.parse((await this.metadata.getFileData(this.currentFile)).initializedOn);
            /**Meta data for the file creation interval */
            this.interval = {
               /**
                * Returns whether or not the interval is active 
                * @returns {Boolean} Whether the interval is active
                */
               getActivity: () => this.#intervalMeta.active,
               /**Activates the log file interval */
               activate: () => {this.#intervalMeta.active = true},
               /**Deactivates the log file interval*/
               deactiveate: () => {this.#intervalMeta.active = false},
               /**
                * Gets the time delay that the interval uses for new log file creation
                * @returns {Number} Amount of time the interval waits before creating a new log file (in seconds)
                */
               getTimeDelay: () => this.#intervalMeta.timeDelay
            }

            return this;
         });
   }
   //!alert if error
   /**Creates a new log file when the specified amount of time has passed */
   async #intervalEvent(){
      try {
         if (this.#intervalMeta.active){
            if (Date.parse(new Date()) - this.#intervalMeta.initializationDate > this.#intervalMeta.timeDelay){
               await this.createNewLogFile();
               console.log(terminalFormatter.bulletPoint, 'Interval Passed; transferred to new log file');
            }
         }
      } catch(err){
         console.error(terminalFormatter.errorPoint,err);
      }
   }
   /**
    * Creates a new log file in the system in full transition. This creates a new log file, 
    * changes the metadata and terminates the previous log file.
    * @async
    * @returns {void}
    */
   async createNewLogFile(){
      const date = new Date();
      const newName = `${clockFormatter.createDate(new Date(),true)}.txt`;
      await this.currentFile.log(`Interval passed; transferring to new log file.`,{name: newName});
      await this.currentFile.terminate();
      await this.metadata.createFile(newName,{
         initialized: true,
         initializedOn: `${date}`
      });
      await fs.writeFile(`${this.directory}/${newName}`,'',{
         encoding: 'utf8'
      });
      this.currentFile = new LogFile(`${this.directory}/${newName}`);
      this.files[newName] = new LogFile(`${this.directory}/${newName}`);
      await this.currentFile.initialize();
      await this.metadata.setCurrentFile(newName);
      this.#intervalMeta.initializationDate = Date.parse(date);

      const fileSize = await this.currentFile.getSize();
      await this.metadata.setFileProperty(this.currentFile,'size',`${fileSize.size} ${fileSize.unit}`);
   }
}

/**Log file wrapper */
export class LogFile extends TXTFile {
   /**
    * Creates a log file class extending TXTFile. Mainly formats inputted values to log file style.
    * @param {String} filepath File path leading to the log file
    */
   constructor(filepath){
      super(filepath);
      this.name = path.basename(filepath);
   }
   /**
    * Formats and logs a value into the designated log file
    * @param  {...any} args Arguments to log into the log file
    * @async
    * @returns {String} New contents of log file
    */
   async log(...args){
      var str = `> [${clockFormatter.createDate(new Date())} at ${clockFormatter.createTime()}] `;
      for (const i of args){
         switch (typeof i){
            case 'object':
               let addon = '';
               if (i instanceof Array){
                  addon = JSON.stringify(i);
               } else {
                  for (const j in i){
                     addon += `\n     ${j[0].toUpperCase()}${j.slice(1,j.length)}: `;
                     if (typeof i[j] == 'object') addon += JSON.stringify(i[j]);
                     else if (typeof i[j] == 'string') addon += `'${i[j]}'`;
                     else addon += i[j];
                  }
               }
               str += addon;
               break;
            default: str += `   ${i}`;
         }
      }
      return await this.write(str,{
         action: 'newline'
      });
   }
   /**
    * Clears the log file and puts a header marking when the log file was initialized. This does not manipulate log meta data.
    * @async
    * @returns {String} New contents of log file
    */
   async initialize(){
      var str = ''.concat(
         '--# Log File Initialized on ',
         clockFormatter.createDate(new Date(),true),
         ' at ',
         clockFormatter.createTime(true),
         ' #--\n'
      );
      return await this.write(str,{
         action: 'set'
      });
   }
   /**
    * Appends a footer to the log file stating when the log file was terminated. This does not manipulate log meta data.
    * @async
    * @returns {String} New contents of log file
    */
   async terminate(){
      var str = ''.concat(
         '\n--# Log File Terminated on ',
         clockFormatter.createDate(new Date(),true),
         ' at ',
         clockFormatter.createTime(true),
         ' #--'
      );
      return await this.write(str,{
         action: 'newline'
      });
   }
}

/**Wrapper for log file metadata */
export class LogMetaFile extends JSONFile {
   constructor(filepath){
      super(filepath);
   }
   /**
    * Gets the metadata of the log file currently in use
    * @async
    * @returns {Object} Metadata of the current log file
    */
   async getCurrentFileData(){
      const data = await this.read();
      return {
         name: data.currentFile,
         ...data.files[data.currentFile]
      };
   }
   /**
    * Sets the current file for the system to use for logging (in the meta data)
    * @param {String} name Name of the log file for the system to use as the current one
    * @async
    * @returns {Object} New value of the property set in meta data
    */
   async setCurrentFile(name){
      return await this.writePath('currentFile',name,{
         action: 'set',
         parse: true
      });
   }
   /**
    * Gets the meta data of a targeted log file
    * @param {String|LogFile} file Log file target to get metadata from
    * @async
    * @returns {Object} Meta data of the log file
    */
   async getFileData(file){
      var name = '';
      if (file instanceof LogFile) name = path.basename(file.filepath);
      else if (typeof file == 'string') name = file;
      else throw new TypeError(`Expected type 'string' or instance of LogFile, recieved '${typeof file}'`);
      return (await this.read()).files[name];
   }
   /**
    * Sets a specified property of a log file meta data to a given value
    * @param {String|LogFile} file File target to set the meta data property of
    * @param {String} nodepath JS notation property path to target (ie: 'key1.key2.key3')
    * @param {any} value Value to set the meta data property
    * @async
    * @returns {any} Newly set data of the property node in the meta data
    */
   async setFileProperty(file,nodepath,value){
      var name = '';
      if (file instanceof LogFile) name = path.basename(file.filepath);
      else if (typeof file == 'string') name = file;
      else throw new TypeError(`Expected type 'string' or instance of LogFile, recieved '${typeof file}'`);

      const finalNodePath = `files.'${name}'.${nodepath}`;
      return await this.writePath(finalNodePath,value,{
         action: 'set',
         parse: true
      });
   }
   /**
    * Creates a new meta data slot for a log file
    * @param {String} name Name of the log file to create meta data for
    * @param {Object} data Meta data to define before it's written into the file
    * @param {String} [data.initializedOn] Stringified Date instance of when the log file was initialized
    * @param {Boolean} [data.initialized] Whether the file has been initialized
    * @param {String} [data.terminatedOn] Stringified Date instance of when the log file was termianted
    * @param {Boolean} [data.terminated] Whether the file has been terminated
    * @param {String} [data.size] The size of the log file. Example: 512 B, 200 MB
    * @async
    * @returns {Object} Meta data that was written to the file
    */
   async createFile(name,data){
      var writeData = {
         initializedOn: null,
         initialized: false,
         terminatedOn: null,
         terminated: false,
         size: null
      };
      Object.assign(writeData,data);
      return await this.writePath(`files.'${name}'`,writeData,{
         action: 'set',
         parse: true
      });
   }
}

export default LogManifest;
