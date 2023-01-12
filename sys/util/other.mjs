/**
 * Returns whether a specified object containg the data in another specified object
 * @param {Object} obj1 First objec to compare
 * @param {Object} obj2 Second object to compare
 * @returns {Boolean} Whether the first object contains the second
 */
export const objectContains = (obj1,obj2) => {
   for (const i in obj2){
      if (typeof obj2[i] !== 'object'){
         if (obj1[i] !== obj2[i]) return false;
      } else {
         if (typeof obj1[i] !== 'object') return false;
         if (!objectContains(obj1[i],obj2[i])) return false;
      }
   }
   return true;
}

/**
 * Returns an array that contains keys of the objects that lead to a value inside a parent object
 * @param {String} str Javascript literal syntax of object reference in a string
 * @returns {Array} A path array outlining where the path to follow leads
 */
export const nodePathArr = (str) => {
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

/**
 * Utilize the setTimeout function with Promises for better use in asycnronous functions
 * @param {Function} execution Function to execute after a certain amount of time
 * @param {Number} time Time in milliseconds until funtion is executed
 * @returns {void}
 */
export const timeout = (execution,time) => {
   return new Promise(async (resolve,reject) => {
      setTimeout(async () => {
         await execution();
         resolve();
      },time)
   })
};

export const formPayload = (payload = {}) => {
   const {body} = payload;
   if (typeof body.type == 'undefined'){
      if (typeof body.command !== 'undefined') body.type = 'command';
   }
   return payload;
}

export const logFormat = {
   header: ['\x1b[0m\x1b[32m','===========','\x1b[36m','Starting Application','\x1b[32m','===========\x1b[0m'],
   bulletPoint: ['\x1b[0m\x1b[34m','   ->','\x1b[0m\x1b[33m'],
   subBulletPoint: ['\x1b[0m\x1b[34m','       -','\x1b[0m'],
   footer: ['\x1b[0m\x1b[32m','===========','\x1b[36m','Application Online','\x1b[32m','===========\x1b[0m'],
   normal: ['\x1b[0m\x1b[32m','$>  \x1b[0m'],
   error: ['\x1b[0m\x1b[31m','$>  \x1b[0m'],
   reset: ['\x1b[0m'],
   boolean: (condition) => `${(condition) ? '\x1b[0m\x1b[36m' : '\x1b[0m\x1b[31m'}${condition}`
};
