import fs from 'node:fs/promises';
import path from 'node:path';

/**JSON File wrapper */
export class JSONFile {
   /**
    * @param {String} filepath File path pointing towards the JSON file
    */
   constructor (filepath){
      if (typeof filepath !== 'string') throw new Error('Expected type string for file path of JSON file');
      /**File path of JSON file */
      this.filepath = filepath;
   }
   /**
    * Gets a value from an object using a dynamic path in a string
    * @param {String} path Javascript object syntax of what value to get (ie: "obj.person.age")
    * @param {Object} obj Object to disect and acquire path value 
    * @returns {any} Value at the end of path in object
    */
   static followNodePath(path,obj){
      var pathArray = nodePathArr(path);
      for (const i of pathArray){
         if (typeof obj !== 'undefined') obj = obj[i];
         else throw new Error(`Object node path does not exist in object`);
      }
      return obj;
   }
   /**
    * Creates a new JSON file at a specified directory with specified name
    * @async
    * @param {String} dir Directory of where to create the file
    * @param {String} name Name of the file (not including file extension)
    * @param {String} data Data to save to the file in stringified JSON form
    * @returns {JSONFile} JSONFile instance of the file created 
    */
   static async create(dir,name,data){
      var dirdata = await fs.readdir(dir,{encoding: 'utf8'});
      if (dirdata.indexOf(`${name}.json`) !== -1) throw new Error(`File '${name}.json' already exists`);
      await fs.writeFile(`${dir}/${name}.json`,data ?? `{}`,{encoding: 'utf8'});
      dirdata = await fs.readdir(dir,{encoding: 'utf8'});
      if (dirdata.indexOf(`${name}.json`) == -1) throw new Error('File did not save correctly');
      return new JSONFile(`${dir}/${name}.json`);
   }
   /**
    * Deletes a specified JSON file using a JSONFile instance or file path
    * @async
    * @param {JSONFile|String} target JSON file class instance or string value of a file path leading to target
    * @returns {void}
    */
   static async delete(target){
      var targetPath;
      if (target instanceof JSONFile) targetPath = target.filepath; 
      else if (typeof target == 'string') targetPath = target;
      else throw new TypeError(`Expected type 'string' or instanceof JSONFile, recieved ${typeof target}`);

      var dirdata = await fs.readdir(path.dirname(targetPath),{encoding: 'utf8'});
      if (dirdata.indexOf(path.basename(targetPath)) == -1) throw new ReferenceError(`File '${path.basename(targetPath)}' doesn't exist`);
      else {
         await fs.unlink(targetPath);
         dirdata = await fs.readdir(path.dirname(targetPath),{encoding: 'utf8'});
         if (dirdata.indexOf(path.basename(targetPath)) !== -1) throw new Error(`File deletion unsuccessful`);
      }
   }
   /**
    * Read data from designated file
    * @async
    * @param {Boolean} [parseData] Whether or not to parse JSON data into Javascript object data type
    * @returns {Object} JSON data from file in Javascript object data type or literal JSON string
    */
   async read(parse = true){
      const data = await fs.readFile(this.filepath,{encoding: 'utf8'});
      return parse ? JSON.parse(data) : data;
   }
   /**
    * Reads data from designated file at specified node
    * @async
    * @param {String} path JS syntax path in a string to target JSON object node of JSON file to read
    * @param {Boolean} [parse] Whether or not to parse JSON data into Javascript object data type
    * @returns {any} JSON data from file in Javascript object data type or literal JSON string
    */
   async readPath(path,parse = true){
      if (typeof path !== 'string') throw new TypeError(`Expected type 'string' recieved '${typeof path}'`);
      const data = JSONFile.followNodePath(path,await this.read());
      return parse ? data : JSON.stringify(data);
   }
   /**
    * Overwrites JSON file to a provided object.
    * @async
    * @param {Object} data Data to completely overwrite JSON file. File JSON object will be set to the data; no appendation is done.
    * @param {Boolean} [parse] Whether or not to parse the JSON data it writes/returns
    * @returns {Object} Overwritten data
    */
   async write(data,parse = true){
      if (typeof data !== 'object') throw new TypeError(`Expected type 'object' in JSONFile.write; instead recieved ${typeof data}`);
      await fs.writeFile(this.filepath,JSON.stringify(data));
      const readData = await this.read();
      if (JSON.stringify(readData) !== JSON.stringify(data)) throw new Error('Data did not write correctly');
      return parse ? readData : JSON.stringify(readData);
   }
   /**
    * Overwrite a specific path in the JSON json file.
    * @async
    * @param {String} path JS syntax path in a string to target JSON object node of JSON file to write
    * @param {Object} data Value to set location of JSON path to
    * @param {Object} [options] Writing options for node
    *    @param {String} options.action Action specify how to the data is stored ('set' | 'append' | 'prepend' | 'delete')
    *    @param {Boolean} [options.parse] Whether or not to parse JSON data into Javascript object data type
    * @returns {Promise.Object} Overwritten data at node
    */
   async writePath(path,data,options = {action: 'set', parse: true}){
      var pathArray = nodePathArr(path), {action, parse} = options, originalPath = path;
      if (typeof path !== 'string') throw new TypeError(`Expected type 'string' recieved '${typeof path}'`);
      const jsonData = await this.read();
      var recursive = {
         json: Object.assign({},jsonData),
         overwrite: data
      }
      for (let i = pathArray.length-1; i >= 0; i--){
         for (let j = 0; j < i; j++){
            recursive.json = recursive.json[pathArray[j]];
         }
         if (i == pathArray.length-1){
            switch (action){
               case 'set':
                  recursive.json[pathArray[i]] = recursive.overwrite;
                  break;
               case 'append':
                  recursive.json[pathArray[i]].push(recursive.overwrite);
                  break;
               case 'prepend':
                  recursive.json[pathArray[i]].unshift(recursive.overwrite);
                  break;
               case 'delete':
                  if (recursive.json instanceof Array){
                     recursive.json = [
                        ...recursive.json.slice(0,pathArray[i]),
                        ...recursive.json.slice(pathArray[i]+1,recursive.json.length)
                     ]
                  } else delete recursive.json[pathArray[i]]
                  break
            }
         } else {
            recursive.json[pathArray[i]] = recursive.overwrite;
         }
         recursive.overwrite = recursive.json;
         recursive.json = Object.assign({},jsonData);
      }
      const result = JSONFile.followNodePath(originalPath, await this.write(recursive.overwrite));
      return parse ? result : JSON.stringify(result);
   }
}

/**TXT File wrapper*/
export class TXTFile {
   /**
    * @param {String} filepath Path for the text file class to target (without file extension)
    */
   constructor (filepath){
      this.filepath = filepath;
   }
   /**
    * Creates a new text file at a specified directory
    * @async
    * @param {String} dir Directory path of where to create the file
    * @param {String} name Name of file to save (not including file extension)
    * @param {String} data Data to save to the file in string form
    * @returns {TXTFile} TXTFile instance of file just created
    */
   static async create(dir,name,data){
      var dirdata = await fs.readdir(dir,{encoding: 'utf8'});
      if (dirdata.indexOf(`${name}.txt`) !== -1) throw new Error(`File '${name}.txt' already exists`);
      await fs.writeFile(`${dir}/${name}.txt`,data ?? '',{encoding: 'utf8'});
      dirdata = await fs.readdir(dir,{encoding: 'utf8'});
      if (dirdata.indexOf(`${name}.txt`) == -1) throw new Error('File did not save correctly');
      return new TXTFile(`${dir}/${name}`);
   }
   /**
    * Deletes a specified TXT file using a TXTFile instance or file path
    * @async
    * @param {TXTFile|String} target TXT file class instance or string value of a file path leading to target
    * @returns {void}
    */
   static async delete(target){
      var targetPath;
      if (target instanceof TXTFile) targetPath = target.filepath; 
      else if (typeof target == 'string') targetPath = target;
      else throw new TypeError(`Expected type 'string' or instanceof TXTFile, recieved ${typeof target}`);

      var dirdata = await fs.readdir(path.dirname(targetPath),{encoding: 'utf8'});
      if (dirdata.indexOf(path.basename(targetPath)) == -1) throw new ReferenceError(`File '${path.basename(targetPath)}' doesn't exist`);
      else {
         await fs.unlink(targetPath);
         dirdata = await fs.readdir(path.dirname(targetPath),{encoding: 'utf8'});
         if (dirdata.indexOf(path.basename(targetPath)) !== -1) throw new Error(`File deletion unsuccessful`);
      }
   }
   /**
    * Gets data of the TXT file
    * @async
    * @returns {Promise.String} Data of TXT file in a string
    */
   async read(){
      return await fs.readFile(this.filepath,{encoding: 'utf8'});
   }
   /**
    * Writes to TXT file in different ways
    * @async
    * @param {String} data String data to write to the TXT file
    * @param {Object} [options] Options on how to write to file
    * @param {String} options.action Action user to write to file (set | append | prepend | clear | insert | newline)
    * @param {Number} [options.index] Index to insert string after (required if using 'insert' action)
    * @returns {String} Overwritten data of text file
    */
   async write(data,options = {action: 'set', index: undefined}){
      const {action,index} = options;
      if (typeof data !== 'string' && action !== 'clear') throw new TypeError(`Expected type 'string', instead recieved ${typeof data}`);
      var readData = await this.read();
      switch (action){
         case 'set':
            readData = data;
            break;
         case 'append':
            readData = `${readData}${data}`;
            break;
         case 'prepend':
            readData = `${data}${readData}`
            break;
         case 'newline':
            readData = `${readData}\n${data}`;
            break
         case 'clear':
            readData = '';
            break;
         case 'insert':
            if (typeof index == 'undefined') throw new TypeError(`Expected type 'number', instead recieved ${typeof index}`);
            readData = ''.concat(...[
               readData.slice(0,index+1),
               data,
               readData.slice(index+1,readData.length-1)
            ]);
            break;
         default: throw new TypeError(`Expected type 'string', instead recieved ${typeof options.action}`);
      }
      await fs.writeFile(this.filepath,readData,{encoding: 'utf8'});
      const checkData = await this.read();
      if (checkData !== readData) throw new Error('Data did not write correctly');
      return checkData;
   }
}

/**General File wrapper */
export class File {
   /**
    * Returns a class instance based on the file extension (compatible file types: JSON, TXT)
    * @param {String} filepath File path of desired file
    */
   constructor(filepath){
      switch (path.extname(filepath)){
         case '.json': return new JSONFile(filepath);
         case '.txt': return new TXTFile(filepath);
         default: throw new Error(`Incompatible file type '${path.extname(filepath)}'`)
      }
   }
}

/**
 * Returns an array that contains keys of the objects that lead to a value inside a parent object
 * @param {String} str Javascript literal syntax of object reference in a string
 * @returns {Array} A path array outlining where the path to follow leads
 */
const nodePathArr = (str) => {
   const splitDot = str.split('.');
   var pathArr = [];
   for (const i of splitDot){
      if (i.indexOf('[') !== -1){
         let splitBracket = i.split('[');
         pathArr.push(splitBracket[0]);
         splitBracket = splitBracket.slice(1,splitBracket.length);
         splitBracket.forEach(i => pathArr.push(parseInt(i.slice(0,i.indexOf(']')))));
      } else pathArr.push(i);
   }
   return pathArr;
};
