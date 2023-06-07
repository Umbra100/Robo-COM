import fs from 'node:fs/promises';
import path from 'node:path';
import LogManifest from "./log-control.mjs";
import { File, JSONFile, TXTFile } from "./file-classes.mjs";
import ConfigFile from "../../config.mjs";
import { getConfigTimeDelay, terminalFormatter } from "../helper.mjs";
import { Subsystem } from '../highway.mjs';

/**The client responsible for all local file manipulations. */
class LocalClient {
   #subsystem
   constructor(){
      return Promise.resolve()
         .then(async () => {
            console.log(terminalFormatter.bootBulletPoint,'Starting Local File System Client');
            this.logs = await new LogManifest({
               directory: ConfigFile.log_directory,
               interval: getConfigTimeDelay()
            });
            console.log(terminalFormatter.bootSubBulletPoint,'Log Manifest Created');
            this.logs.interval.activate();
            console.log(terminalFormatter.bootSubBulletPoint,'Log Interval Active');

            console.log(terminalFormatter.bootSpecialSubBulletPoint,'Client Active');
            this.#subsystem = new Subsystem('Local',this);
            return this;
         })
   }
   /**
    * Creates a new file based of given parameters.
    * @param {Object} options Options to dictate how the file is created.
    * @param {String} options.filepath The filepath of the file to create. This should include the directorty, file name, and file extension in one complete path.
    * @param {String} [options.encoding] How the file is encoded (Default: 'utf8').
    * @async
    * @returns {void}
    */
   async createFile({filepath, data, encoding = 'utf8'} = options){
      const dirRead = await fs.readdir(path.dirname(filepath),{encoding: 'utf8'});
      if (dirRead.indexOf(`${path.basename(filepath)}`) !== -1) throw new Error(`File '${path.basename(filepath)}' already exists in directory '${path.dirname(filepath)}'`);
      
      await fs.writeFile(`${filepath}`,data,{encoding: encoding});
   }

   /**
    * Deletes a file at a given file path.
    * @param {String} filepath The filepath of the file to delete. This should include the directorty, file name, and file extension in one complete path.
    * @async
    * @returns {void}
    */
   async deleteFile(filepath){
      const dirRead = await fs.readdir(path.dirname(filepath),{encoding: 'utf8'});
      if (dirRead.indexOf(`${path.basename(filepath)}`) == -1) throw new Error(`File '${path.basename(filepath)}' does not exist in directory '${path.dirname(filepath)}'`);
      
      await fs.unlink(filepath);
   }
   
   /**
    * Reads the raw data of a given file
    * @param {Object} options Options to dictate how the file is read.
    * @param {String} options.filepath The filepath of the file to read. This should include the directorty, file name, and file extension in one complete path.
    * @param {String} [options.encoding] What encoding should be used to read the file (Default: 'utf8')
    * @async
    * @returns {any} The raw data of the given file
    */
   async readFile({filepath, encoding = 'utf8'} = options){
      const dirRead = await fs.readdir(path.dirname(filepath),{encoding: 'utf8'});
      if (dirRead.indexOf(`${path.basename(filepath)}`) == -1) throw new Error(`File '${path.basename(filepath)}' does not exist in directory '${path.dirname(filepath)}'`);
      
      return await fs.readFile(filepath,{encoding});
   }

   /**
    * Writes data to a file based of given parameters.
    * @param {Object} options Options to dictate how the file is overwritten.
    * @param {String} options.filepath The filepath of the file to write to. This should include the directorty, file name, and file extension in one complete path.
    * @param {String} [options.encoding] How the file is encoded (Default: 'utf8').
    * @async
    * @returns {void}
    */
   async writeFile({filepath, data, encoding = 'utf8'} = options){
      const dirRead = await fs.readdir(path.dirname(filepath),{encoding: 'utf8'});
      if (dirRead.indexOf(`${path.basename(filepath)}`) == -1) throw new Error(`File '${path.basename(filepath)}' does not exist in directory '${path.dirname(filepath)}'`);
      
      await fs.writeFile(`${filepath}`,data,{encoding: encoding});
   }

   /**
    * Creates a file wrapper of a given file and returns it.
    * @param {String} filepath The filepath of the file to delete. This should include the directorty, file name, and file extension in one complete path.
    * @async
    * @returns {File | JSONFile | TXTFile} The file wrapper
    */
   async getFile(filepath){
      const dirRead = await fs.readdir(path.dirname(filepath),{encoding: 'utf8'});
      if (dirRead.indexOf(`${path.basename(filepath)}`) == -1) throw new Error(`File '${path.basename(filepath)}' does not exist in directory '${path.dirname(filepath)}'`);
      
      return new File(filepath);
   }
}

export default LocalClient;
