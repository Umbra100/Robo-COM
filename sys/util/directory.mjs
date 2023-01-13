import fs from 'node:fs';
import { objectContains, nodePathArr } from './other.mjs';
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
      var pathArray = nodePathArr(path), {action} = options, originalPath = path;
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

/**Complete manifest of directory control*/
export default class DirectoryManifest {
   constructor (configfilepath){
      return new Promise(async (resolve,reject) => {
         //* Create config directory reference and config file wrapper
         this.configdir = configfilepath;
         /**@private */
         
         /**JSON File wrapper of config data */
         this.ConfigFile = new (class extends JSONFile {
            constructor (filepath){
               super(filepath);
            }
         })(this.configdir);

         //* Get directory references for class creation
         this.livedir = await this.ConfigFile.read()
            .then(data => data.CONSTANT.liveFileLocation);
         this.logdir = await this.ConfigFile.read()
            .then(data => data.logs.folderLocation);
         this.uidir = await this.ConfigFile.read()
            .then(data => data.CONSTANT.UIFileLocation);
         this.userdir = await this.ConfigFile.read()
            .then(data => data.CONSTANT.userFileLocation)
         var livedir = this.livedir;
         var logdir = this.logdir;

         //* Create live file wrapper
         /**JSON File wrapper of live data */
         this.LiveFile = await new (class extends JSONFile {
            constructor (filepath){
               return new Promise(async (resolve,reject) => {
                  super(filepath);
                  /**Container of entry arrays in live data */
                  this.EntryArray = {
                     /**Log file entries */
                     log: await new (class {
                        constructor (){
                           return new Promise(async (resolve,reject) => {
                              /**@private */
                              this.livedir = livedir;
                              /**@private */
                              this.logdir = logdir;
                              /**@private */
                              this.internalProto = await new EntryArray(this.livedir,'logEntries');
                              resolve(this);
                           });
                        }
                        /**
                         * Gets a log entry from live data
                         * @async
                         * @param {Object} entry Log entry query to get from entry array
                         * @returns {Object} Log entry
                         */
                        async get(entry){
                           return await this.internalProto.get(entry);
                        }
                        /**
                         * Gets an array of all log entries
                         * @async
                         * @returns {Array} Array of log entries
                         */
                        async getAll(){
                           return await this.internalProto.getAll();
                        }
                        /**
                         * Appends new log entry to log entries in live data
                         * @async
                         * @param {Object} entry Log entry to add to live data
                         * @returns {Array} Overwritten data of entry array
                         */
                        async add(entry = {}){
                           var dir = await new Promise(async (resolve,reject) => {
                              fs.readdir(this.logdir,'utf8',(err,data) => {
                                 if (err) reject(err);
                                 resolve(data);
                              })
                           })
                              .then(data => data);
                           let latest = dir[dir.length-1];
                           latest = parseInt(latest.split('-')[1].split('.')[0]);
                           entry.name = `log-${latest+1}`;
                           if (typeof entry.timeCreated == 'undefined') entry.timeCreated = new Date();
                           return await this.internalProto.add(entry)
                        }
                        /**
                         * Deletes an entry from log entries in live data
                         * @async
                         * @param {Object} entry Log entry query to delete from live data
                         * @returns {Promise.Array} Overwritten data of entry array
                         */
                        async delete(entry = {}){
                           if (typeof entry.name !== 'string') throw new TypeError(`Expected type 'string' for log entry name, recieved '${typeof entry.name}'`);
                           return await this.internalProto.delete(entry);
                        }
                     })()
                  }
                  resolve(this);
               })
            }
         })(this.livedir);

         var logentries = await this.LiveFile.EntryArray.log.getAll();

         //* Create log file wrapper
         this.LogFile = await new (class {
            constructor (){
               return new Promise(async (resolve,reject) => {
                  /**@private */
                  this.dir = logdir;
                  /**@private */
                  this.livedir = livedir;
                  /**Name of log file that is being targeted by manifest */
                  this.target = null

                  var readData = {
                     latestEntry: {
                        exists: false,
                        number: 0,
                        timeCreated: null
                     },
                     laterFile: {
                        exists: false,
                        number: 0,
                        timeCreated: null
                     }
                  }
                  
                  for (const i of logentries){
                     let logNum = parseInt(i.name.split('-')[1]);
                     if (logNum > readData.latestEntry.number) {
                        readData.latestEntry.number = logNum;
                        readData.latestEntry.timeCreated = i.timeCreated;
                     }
                  }
                  readData.latestEntry.exists = await (new Promise(async (resolve,reject) => {
                     fs.readdir(this.dir,'utf8',(err,data) => {
                        if (err) throw err;
                        let arr = data.map(j => parseInt(j.split('-')[1].split('.')[0]));
                        for (const i of arr) if (i > readData.latestEntry.number){
                           readData.laterFile.exists = true;
                           readData.laterFile.number = i;
                        }
                        resolve(arr.indexOf(readData.latestEntry.number) !== -1);
                     })
                  }))
                     .then(data => data);
                  if (readData.laterFile.exists){
                     let file = new TXTFile(`${this.dir}/log-${readData.laterFile.number}`);
                     let data = await file.read()
                        .then(data => data)
                        .catch(err => {throw err});
                     data = data.slice(6,data.indexOf(']'));
                     data = this.date.revert(data);
                     let jsonFile = new JSONFile(livedir);
                     await jsonFile.writePath('logEntries',{name: `log-${readData.laterFile.number}`,timeCreated: new Date(data)},{ action: 'append' });
                     this.target = `log-${readData.laterFile.number}`;
                     resolve(this);
                  } else {
                     if (readData.latestEntry.exists){
                        this.target = `log-${readData.latestEntry.number}`;
                        resolve(this);
                     } else {
                        await TXTFile.create(this.dir,`log-${readData.latestEntry.number}`)
                           .then(async file => {
                              let date = new Date();
                              await file.write(this.date.header(readData.latestEntry.timeCreated || date));
                              let live = new JSONFile(this.livedir);
                              const entries = await live.read()
                                 .then(data => data.logEntries.map(i => i.name));
                              if (entries.indexOf(`log-${readData.latestEntry.number}`) == -1){
                                 await live.writePath('logEntries',{ name: `log-${readData.latestEntry.number}`, timeCreated: date}, { action: 'append' });
                              }
                              this.target = `log-${readData.latestEntry.number}`;
                              resolve(this);
                           });
                     }
                  }
               });
            }
            /**
             * Logs specified strings into log file
             * @param  {...Any} arg String to be logged into targeted log file
             * @returns {String} Overwritten string data of log file
             */
            async log(...arg){
               const evaluateString = (str) => {
                  let brArr = str.split('\n');
                  for (var i = 1; i < brArr.length; i++) brArr[i] = (typeof brArr[i] == 'undefined') ? '' : `\n   ${brArr[i]}`;
                  if (!lineBreak && str.indexOf('\n') !== -1) {
                     brArr[1] = (typeof brArr[1] == 'undefined') ? '' : `${brArr[1]}`;
                     lineBreak = true;
                  }
                  return ''.concat(...brArr);
               }
               var logCompile = '';
               var lineBreak = false;
               for (const i of arg){
                  switch (typeof i){
                     case 'string':
                        logCompile += i;
                        break;
                     case 'object':
                        if (i instanceof Error){
                           let arr = i.stack.split('\n');
                           for (var j = 1; j < arr.length; j++) arr[j] = `\n${arr[j]}`;
                           logCompile += '\n'.concat(...arr);
                        } else {
                           let arr = [];
                           for (const j in i) arr.push(`\n   ${j}:  ${JSON.stringify(i[j])}`);
                           logCompile += ''.concat(...arr);
                        }
                        break;
                     default: logCompile += JSON.stringify(i);
                  }
               }
               logCompile = `\n[${this.date.create(new Date())}]  ${evaluateString(logCompile)}${(lineBreak) ? '\n' : ''}`;
               var file = new TXTFile(`${this.dir}/${this.target}`);
               const readData = await file.write(logCompile,{ action: 'append' });
               return readData;
            }
            /**
             * Force creates a new log file and entry pair; also notes in previous log file that is has been terminated
             * @returns {String} Name of log file that directory manifest is now targetting
             */
            async new(){
               return new Promise(async (resolve,reject) => {
                  fs.readdir(this.dir,'utf8',async (err,data) => {
                     if (err) throw err;
                     var latestNum = -1;
                     for (const i of data){
                        let num = parseInt(i.split('-')[1].split('.')[0]);
                        if (num > latestNum) latestNum = num;
                     }
                     await new TXTFile(`${this.dir}/log-${latestNum}`).write(''.concat(...[
                        '\n\n$>> [',
                        this.date.create(new Date()),
                        ']  LOG FILE TERMINATED'
                     ]),{ action: 'append' });
                     const date = new Date();
                     await TXTFile.create(`${this.dir}`,`log-${latestNum+1}`)
                        .then(async file => {
                           await file.write(this.date.header(date), { action: 'append' });
                        });
                     const live = new JSONFile(livedir);
                     live.writePath('logEntries',{name: `log-${latestNum+1}`,timeCreated: date},{ action: 'append' });
                     this.target = `log-${latestNum+1}`;
                     resolve(this.target);
                  })
               })
            }
            /**Date object for creating and formatting Date classes for log file format */
            get date(){
               return {
                  /**
                   * Creates a date in string format used for the log files
                   * @param {Date} date Date object to be formatted
                   * @returns {String} Date format for log files
                   */
                  create: (date) => {
                     if (typeof date == 'string') date = new Date(date);
                     const weekDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                     const dateNotation = ''.concat(...[
                        date.getHours(), ':',
                        date.getMinutes(), ':',
                        date.getSeconds(), ':',
                        date.getMilliseconds(),
                        ` ${weekDay[date.getDay()]} `,
                        date.getDate(), '/',
                        date.getMonth()+1, '/',
                        date.getFullYear()
                     ]);
                     return ''.concat(...dateNotation);
                  },
                  /**
                   * Creates a JS date object from a log header date format
                   * @param {String} date Date from log file header
                   * @returns {Date} JS date matching date listed on log file header
                   */
                  revert: (date) => {
                     var returnDate = new Date();
                     date = date.split(' ');
                     date[0] = date[0].split(':').map(i => parseInt(i));
                     date[date.length-1] = date[date.length-1].split('/');
                     returnDate.setHours(date[0][0]);
                     returnDate.setMinutes(date[0][1]);
                     returnDate.setSeconds(date[0][2]);
                     returnDate.setMilliseconds(date[0][3]);
                     returnDate.setDate(date[2][0]);
                     returnDate.setMonth(date[2][1]-1);
                     returnDate.setFullYear(date[2][2]);
                     return returnDate;
                  },
                  /**
                   * Creates a header that's put at the top of log files
                   * @param {Date} date Date user to create header creation time notation
                   * @returns {String} Log file date header
                   */
                  header: (date) => {
                     return ''.concat(...[
                        '$>> [',
                        this.date.create(date),
                        ']  LOG FILE INITIALIZED\n'
                     ]);
                  }
               }
            }
         })();

         //* Create UI file wrapper
         this.UIFile = await new (class extends JSONFile {
            constructor(filepath){
               super(filepath);
            }
            async CompileModal(uiname,options = {},view){//! Delete if still not used
               const data = typeof view == 'undefined' ? (await this.read())[uiname] : view;
               if (typeof data == 'undefined') throw new Error('UI data not founs; please check ui name');
               var modal = Object.assign({},data.modal);

               for (const i of data.alternations){
                  let index = Object.keys(options).indexOf(i.action_id);
                  let nodeArr = nodePathArr(i.key);
                  let overwrite;
                  if (index == -1){
                     overwrite = i.options[i.defaultOption];
                  } else {
                     overwrite = i.options[options[Object.keys(options)[index]]];
                  }
                  if (typeof overwrite == 'undefined') throw new Error('Alternate option not available in UI; please check UI data.');
                  let recursive = {data: modal,overwrite};
                  for (var j = nodeArr.length-1; j >= 0; j--){
                     for (var k = 0; k < j; k++){
                        recursive.data = recursive.data[nodeArr[k]];
                     }
                     recursive.data[nodeArr[j]] = recursive.overwrite;
                     recursive.overwrite = recursive.data;
                     recursive.data = modal;
                  }
                  modal = Object.assign({},recursive.overwrite);
               }
               return modal;
            }
            CompileEventModal(modal){
               const excludeKeys = [
                  'id',
                  'team_id',
                  'state',
                  'hash',
                  'private_metadata',
                  'previous_view_id',
                  'root_view_id',
                  'app_id',
                  'external_id',
                  'app_installed_team_id',
                  'bot_id'
               ];
               var compile = {};
               for (const i in modal){
                  if (excludeKeys.indexOf(i) == -1) compile[i] = modal[i];
               };
               return compile;
            }
            async getViewData(uiname){
               const data = await this.read()
                  .then(data => data[uiname]);
               if (typeof data == 'undefined') throw new Error('UI view data not available for name; please check UI data for valid keys');
               return data.modal;
            }
         })(this.uidir);

         //* Create user data file wrapper
         this.UserFile = await new (class extends JSONFile {
            constructor(filepath){
               super(filepath);
            }
            async getUserData(id){
               const data = await this.read()
                  .then(d => d.data);
               var user;
               for (const i of data){
                  if (i.user_id == id){
                     user = i;
                     break;
                  }
               }
               return user;
            }
            async setUserData(id,data){
               const userData = await this.read()
                  .then(d => d.data);
               var compile = [];
               for (const i of userData){
                  if (i.user_id !== id) compile.push(i);
               }
               compile.push(data);
               await this.writePath('data',compile);
            }
         })(this.userdir);

         resolve(this);
      })
   }
}

/**Array wrapper for entry arrays in live data */
class EntryArray extends JSONFile {
   /**
    * Creates a JSON file instance to wrap entry arrays
    * @async
    * @param {String} filepath File path for JSON file that contains entry array
    * @param {String} nodepath String in js object literal syntax to point towards entry array
    * @returns {Promise.EntryArray} An entry array wrapper with extra functionality
    */
   constructor (filepath,nodepath){
      return new Promise(async (resolve,reject) => {
         super(filepath);
         this.nodepath = nodepath;
         var file = new JSONFile(this.filepath);
         const data = await file.readPath(this.nodepath)
            .then(data => data);
         if (!Array.isArray(data)) throw new TypeError(`Not compatible with type '${typeof data}' at '${this.nodepath}' in file '${this.filepath}'`);
         else for (var i of data){
            if (typeof i !== 'object') throw new TypeError(`Expected type 'object' in entry array, recieved type '${typeof i}' at '${this.nodepath}' in file '${this.filepath}'`);
         }
         resolve(this);
      })
   }
   /**
    * Gets all entries that have specific object data (ie: {action: 'unblacklist',duration: '600000'})
    * @async
    * @param {Object} entry Object data to search entries with
    * @returns {Array} Array containing all entries that contain specified object data 
    */
    async get(entry){
      const entries = await this.readPath(this.nodepath);
      var result = [];
      for (const i of entries){
         if (objectContains(i,entry)) result.push(i);
      }
      return result;
   }
   /**
    * Gets all entries in live data
    * @async
    * @returns {Array} Array containing all entries
    */
   async getAll(){
      return await this.readPath(this.nodepath);
   }
   /**
    * Appends new entry to entry array
    * @async
    * @param {Object} entry JS Object of entry to be appened to entry array
    * @returns {Array} Overwritten data of entry array
    */
   async add(entry){
      if (typeof entry !== 'object') throw new TypeError(`Expected type 'object' recieved '${typeof entry}'`);
      return await this.writePath(this.nodepath,entry,{ action: "append" });
   }
   /**
    * Deletes a specified entry from the array
    * @async
    * @param {Object} entry Entry to delete from array
    * @returns {Array} Overwritten data of entry array
    */
   async delete(entry){
      const entries = await this.readPath(this.nodepath);
      var result = [], index = -1;
      for (var i = 0; i < entries.length; i++){
         let found = true
         if (objectContains(entries[i],entry)){
            found = true;
            result.push(entries[i]);
            if (index == -1) index = i;
         }
      }
      if (result.length > 1) throw new Error(`Multiple entries detected at '${this.nodepath}' in '${this.filepath}':\n${JSON.stringify(entry)}`);
      else if (result.length < 1) throw new Error(`Entry does not exist at '${this.nodepath}' in '${this.filepath}':\n${JSON.stringify(entry)}`);
      else await this.writePath(`${this.nodepath}[${index}]`,undefined,{ action: 'delete' });
      return await this.readPath(this.nodepath);
   }
}

/**Object containing helpers for file paths */
export const path = {
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
   }
}
