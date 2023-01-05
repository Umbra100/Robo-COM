import fs from 'node:fs';
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
    * @returns {Any} Value at the end of path in object
    */
   static followNodePath(path,obj){
      var pathArray = pathHelper.nodeArr(path);
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
    * @param {String} name Name of the file 
    * @returns {Promise.Void} 
    */
   static async create(dir,name){
      return new Promise(async (resolve,reject) => {
         fs.readdir(dir,{encoding: 'utf8'},(err,data) => {
            if (err) throw err;
            if (data.indexOf(`${name}.json`) !== -1) throw new Error(`File '${name}.json' already exists`);
            fs.writeFile(`${dir}/${name}.json`,`{}`,{ encoding: 'utf8' },(err) => {
               if (err) throw err;
               fs.readdir(dir,{encoding: 'utf8'},(err,data) => {
                  if (err) throw err;
                  if (data.indexOf(`${name}.json`) !== -1) resolve();
                  else throw new Error('File did not save correctly, please try again');
               });
            })
         });
      })
   }
   /**
    * Deletes a specified JSON file using a JSONFile instance
    * @async
    * @param {JSONFile} jsonfile JSON file class instance
    * @returns {Promise.Void}
    */
   static async delete(jsonfile){
      return new Promise(async (resolve,reject) => {
         const pathSplit = [
            jsonfile.path.slice(0,jsonfile.path.lastIndexOf('/')),
            jsonfile.path.slice(jsonfile.path.lastIndexOf('/')+1,jsonfile.path.length)
         ];

         fs.readdir(pathSplit[0],{encoding: 'utf8'},(err,data) => {
            if (err) throw err;
            if (data.indexOf(pathSplit[1]) == -1) throw new Error(`File '${pathSplit[1]}' doesn't exist`);
            fs.unlink(jsonfile.path,(err) => {
               if (err) throw err;
               fs.readdir(pathSplit[0],{encoding: 'utf8'},(err,data) => {
                  if (err) throw err;
                  if (data.indexOf(pathSplit[1]) == -1) {
                     resolve();
                     return;
                  }
                  throw new Error('File deletion unsuccessful, please try again');
               });
            })
         });
      })
   }
   /**
    * Read data from designated file
    * @async
    * @param {Boolean} [parseData] Whether or not to parse JSON data into Javascript object data type
    * @returns {Promise.Object} JSON data from file in Javascript object data type or literal JSON string
    */
   async read(parse = true){
      return new Promise((resolve,reject) => {
         fs.readFile(`${this.filepath}`,'utf8',(err,data) => {
            if (err) throw err;
            resolve((parse) ? JSON.parse(data) : data);
         })
      });
   }
   /**
    * Reads data from designated file at specified node
    * @async
    * @param {String} path JS syntax path in a string to target JSON object node of JSON file to read
    * @param {Boolean} [parse] Whether or not to parse JSON data into Javascript object data type
    * @returns {Promise.Object} JSON data from file in Javascript object data type or literal JSON string
    */
   async readPath(path,parse = true){
      return new Promise((resolve,reject) => {
         if (typeof path !== 'string') throw new TypeError(`Expected type 'string' recieved '${typeof path}'`);
         fs.readFile(`${this.filepath}`,'utf8',(err,data) => {
            if (err) throw err;
            const result = JSONFile.followNodePath(path,JSON.parse(data));
            resolve((parse) ? result : JSON.stringify(result));
         })
      });
   }
   /**
    * Overwrites JSON file to a provided object.
    * @async
    * @param {Object} data Data to completely overwrite JSON file. File JSON object will be set to the data; no appendation is done.
    * @returns {Promise.Object} Overwritten data
    */
   async write(data){
      return new Promise((resolve,reject) => {
         if (typeof data !== 'object') throw new TypeError(`Expected type 'object' in JSONFile.write; instead recieved ${typeof data}`);
         fs.writeFile(`${this.filepath}`,JSON.stringify(data),(err) => {
            if (err) {
               throw err;
            }
            this.read()
               .then(readData => {
                  if (JSON.stringify(readData) !== JSON.stringify(data)) throw new Error('Data did not write correctly, please try again');
                  resolve(readData);
               })
               .catch(err => {throw err});
         });
      })
   }
   /**
    * Overwrite a specific path in the JSON json file.
    * @async
    * @param {String} path JS syntax path in a string to target JSON object node of JSON file to write
    * @param {Object} data Value to set location of JSON path to
    * @param {Object} [options={action:'set'}] Writing options for node
    *    @param {String} [options.action='set'] Action specify how to the data is stored ('set' | 'append' | 'prepend' | 'delete')
    * @returns {Promise.Object} Overwritten data at node
    */
   async writePath(path,data,options = {action: 'set'}){
      var pathArray = pathHelper.nodeArr(path), {action} = options, originalPath = path;
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
      return JSONFile.followNodePath(originalPath, await this.write(recursive.overwrite));
   }
}

/**TXT File wrapper*/
export class TXTFile {
   /**
    * @param {String} filepath Path for the text file class to target (without file extension)
    */
   constructor (filepath){
      this.filepath = `${filepath}.txt`
   }
   /**
    * Creates a new text file at a specified directory
    * @async
    * @param {String} path Directory path of where to create the file
    * @param {String} fileName Name of file to save 
    * @returns {Promise.TXTFile} Text file wrapper class
    */
   static async create(path,fileName){
      return new Promise(async (resolve,reject) => {
         new Promise(async (resolve,reject) => {
            if (typeof path !== 'string') throw new TypeError(`Expected type 'string' in TXTFile.create {static}; instead recieved ${typeof path}`);
            if (typeof fileName !== 'string') throw new TypeError(`Expected type 'string' in TXTFile.create {static}; instead recieved ${typeof fileName}`);
            const filePath = `${path}/${fileName}.txt`;

            const dir = await new Promise(async (resolve,reject) => {
               fs.readdir(path,{encoding: 'utf8'}, (err,data) => {
                  if (err) reject(err);
                  resolve(data);
               });
            })
               .then(data => data)
               .catch(err => {throw err});
            if (dir.indexOf(`${fileName}.txt`) !== -1) throw new Error(`File '${fileName}.txt' already exists`);

            fs.writeFile(filePath,'',(err) => {
               if (err) throw err;
               fs.readFile(filePath,{encoding: 'utf8'},(err,data) => {
                  if (err) throw err;
                  if (data == '') resolve(data);
                  else throw new Error('Data did not write correctly, please try again');
               })
            });
         })
            .then(data => resolve(new TXTFile(`${path}/${fileName}`)))
            .catch(err => reject(err));
      })
   }
   /**
    * Delete a txt file from a specified directory
    * @async
    * @param {String} path Directory path of where to delete the file
    * @param {String} fileName Name of file to delete
    * @returns {Promise.Void}
    */
   static async delete(path,fileName){
      return new Promise(async (resolve,reject) => {
         if (typeof path !== 'string') throw new TypeError(`Expected type 'string' in TXTFile.delete {static}; instead recieved ${typeof path}`);
         if (typeof fileName !== 'string') throw new TypeError(`Expected type 'string' in TXTFile.delete {static}; instead recieved ${typeof fileName}`);
         const dir = await new Promise(async (resolve,reject) => {
            fs.readdir(path,{encoding: 'utf8'}, (err,data) => {
               if (err) reject(err);
               resolve(data);
            });
         })
            .then(data => data)
            .catch(err => {throw err});

         if (dir.indexOf(`${fileName}.txt`) == -1) throw new Error(`File '${fileName}.txt' does not exist`);

         fs.unlink(`${path}/${fileName}.txt`,async (err) => {
            if (err) throw err;

            const dir2 = await new Promise(async (resolve,reject) => {
               fs.readdir(path,{encoding: 'utf8'}, (err,data) => {
                  if (err) reject(err);
                  resolve(data);
               });
            })
               .then(data => data)
               .catch(err => {throw err});

            if (dir2.indexOf(fileName) !== -1) throw new Error('File was not deleted successfully, please try again');
            resolve();
         })
      })
   }
   /**
    * Gets data of the TXT file
    * @async
    * @returns {Promise.String} Data of TXT file in a string
    */
   async read(){
      return new Promise(async (resolve,reject) => {
         fs.readFile(this.filepath,'utf8',(err,data) => {
            if (err) throw err;
            resolve(data);
         });
      })
   }
   /**
    * Writes to TXT file in different ways
    * @async
    * @param {String} data String data to write to the TXT file
    * @param {Object} [options] Options on how to write to file
    * @param {String} options.action Action user to write to file (set | append | prepend | clear | insert | newline)
    * @param {Number} [options.index] Index to insert string after (required if using 'insert' action)
    * @returns {Promise.String} Overwritten data of text file
    */
   async write(data,options = {action: 'set', index: undefined}){
      const {action,index} = options;
      return new Promise(async (resolve,reject) => {
         if (typeof data !== 'string' && action !== 'clear') throw new TypeError(`Expected type 'string' in TXTFile.write; instead recieved ${typeof data}`);
         var readData = await this.read()
            .then(data => data)
            .catch(err => {throw err});
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
               if (typeof index == 'undefined') throw new TypeError(`Expected type 'number' in TXTFile.write; instead recieved ${typeof index}`);
               readData = ''.concat(...[
                  readData.slice(0,index+1),
                  data,
                  readData.slice(index+1,readData.length-1)
               ]);
               break;
            default: throw new TypeError(`Expected type 'string' in TXTFile.write; instead recieved ${typeof options.action}`);
         }
         fs.writeFile(await this.filepath,readData,async (err) => {
            if (err) throw err;
            const checkData = await this.read()
               .then(data => data)
               .catch(err => {throw err});
            if (checkData !== readData) throw new Error('Data did not write correctly, please try again');
            resolve(checkData);
         });
      })
   }
}

/**Object containing helpers for file paths */
export const pathHelper = {
   /**
    * Seperates a file path by '/'
    * @param {String} path File path to turn to array
    * @returns {Array} An array containg names of the files leading in the path
    */
   toArray: (path) => {
      if (path.indexOf('/') == 0){
         path = path.slice(1,path.length);
         return path.split('/');
      } else return path.split('/');
   },
   /**
    * Returns an array that contains keys of the objects that lead to a value inside a parent object
    * @param {String} str Javascript literal syntax of object reference in a string
    * @returns {Array} A path array outlining where the path to follow leads
    */
   nodeArr: (str) => {
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
   }
}

export const logFormat = {
   header: ['\x1b[0m\x1b[32m','=========================================\x1b[0m'],
   bulletPoint: ['\x1b[0m\x1b[34m','   ->','\x1b[0m\x1b[33m'],
   subBulletPoint: ['\x1b[0m\x1b[34m','       -','\x1b[0m'],
   footer: ['\x1b[0m\x1b[32m','===========','\x1b[36m','Robo COM Online','\x1b[32m','===========\x1b[0m'],
   normal: ['\x1b[0m\x1b[32m','$>  \x1b[0m'],
   error: ['\x1b[0m\x1b[31m','$>  \x1b[0m'],
   reset: ['\x1b[0m'],
   boolean: (condition) => `${(condition) ? '\x1b[36m' : '\x1b[31m'}${condition}`
};
