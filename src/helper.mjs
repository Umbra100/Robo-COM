import ConfigFile from "./ConfigFile.mjs";

/**
 * Performs a deep scan of the biggest object and compared all key-value pairs to see if objects are equal
 * @param {Object} obj1 First object to compare
 * @param {Object} obj2 Second object to compare
 * @returns {Boolean} Whether the two provided objects are equal
 */
export const objectEquals = (obj1, obj2) => {
   if (Object.keys(obj1).length > Object.keys(obj2).length) return false;
   for (const i in obj1){
      if (typeof obj1[i] !== 'object'){
         if (obj1[i] !== obj2[i]) return false;
      } else {
         if (typeof obj2[i] !== 'object') return false;
         if (!objectEquals(obj1[i],obj2[i])) return false;
      }
   }
   return true;
}

/**A helper for formatting dates and times */
export const clockFormatter = {
   /**
    * Creates a string that notes the current time in either military or normal time
    * @param {Boolean} readable Whether or not to return the time in a more human readable form (normal time or military time)
    * @returns {String} A string containing a time notation in either military or normal time
    */
   createTime: (readable = false) => {
      const time = new Date();
      if (readable) return ''.concat(
         time.getHours() == 12 ? time.getHours() : time.getHours() % 12,':',
         `${time.getMinutes()}`.length == 1 ? `0${time.getMinutes()}` : `${time.getMinutes()}`,
         time.getHours() > 11 ? ' PM' : ' AM'
      );
      else return ''.concat(
         time.getHours(),':',
         `${time.getMinutes()}`.length == 1 ? `0${time.getMinutes()}` : `${time.getMinutes()}`,':',
         `${time.getSeconds()}`.length == 1 ? `0${time.getSeconds()}` : `${time.getSeconds()}`
      );
   },
   /**
    * Creates a string that notes the provided date in mm/dd/yyyy form or Mon Date Year form
    * @param {Date | String} date Date object to format
    * @param {Boolean} readable Whether or not to return the date in a more human readable form (mm/dd/yyyy or Mon Date Year)
    * @returns {String} A string containing a date notation
    */
   createDate: (date,readable = false) => {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const month = parseInt(JSON.stringify(date).split('T')[0].split('-')[1])-1;
      const day = parseInt(JSON.stringify(date).split('T')[0].split('-')[2]);
      if (typeof date == 'string') date = new Date(date);
      if (readable) return ''.concat(
            months[month],' ',
            day,(
               day == 1 || day == 21 || day == 31 ? 'st ' :
               day == 2 || day == 22 ? 'nd ' :
               day == 3 || day == 23 ? 'rd ' : 'th '
            ),
            date.getFullYear()
         );
      else return ''.concat(
         month+1,'/',
         day,'/',
         date.getFullYear()
      );
   }
}

/**Collection of console log color and format codes. Used to help style the node terminal. */
export const terminalFormatter = {
   bulletPoint: "\x1b[32m->  \x1b[0m",
   errorPoint: "\x1b[31m-!>  \x1b[0m",
   subBulletPoint: "       \x1b[34m- \x1b[0m",
   reset: "\x1b[0m",
   header: "\x1b[36m===============\x1b[1m\x1b[32m Starting Application \x1b[1m\x1b[36m===============\x1b[0m",
   bootBulletPoint: "   \x1b[32m▣\x1b[0m ",
   bootSubBulletPoint: "       \x1b[34m□\x1b[0m",
   bootSpecialSubBulletPoint: "       \x1b[33m□\x1b[0m",
   footer: "\x1b[36m===============\x1b[1m\x1b[32m  Application Online  \x1b[1m\x1b[36m===============\x1b[0m\n"
}

/**
 * Gets the amount of time the log system waits until creating a new file (per config file value) in milliseconds
 * @returns {Number} The amount of time that the config is set to (in milliseconds)
 */
export const getConfigTimeDelay = () => {
   var date = new Date(), dateChange = new Date(date);
   const configValue = ConfigFile.logs.time_unit;
   const unit = `${configValue[0].toUpperCase()}${configValue.slice(1,configValue.length)}${configValue[configValue.length-1] == 's' ? '' : 's'}`;
   
   switch (unit){
      case 'Days':
         dateChange.setDate(dateChange.getDate() + ConfigFile.logs.time_interval);
         break;
      case 'Months':
         dateChange.setMonth(dateChange.getMonth() + ConfigFile.logs.time_interval);
         break;
      case 'Weeks':
         dateChange.setDate(dateChange.getDate() + (ConfigFile.logs.time_interval * 7));
         break;
      default:
         dateChange[`set${unit}`](dateChange[`get${unit}`]() + ConfigFile.logs.time_interval);
   }
   return Date.parse(dateChange) - Date.parse(date);
}

/**
 * Removes the ordinal indicator from a date string. Used to make date processing easier.
 * @param {String} date Readable date format (Jan 1st 2000)
 * @returns {String} Date format without the ordinal indicator (Jan 1 2023)
 */
export const removeOrdinalIndicator = (date) => {
   var index = (
      date.indexOf('st') !== -1 ? date.indexOf('st') :
      date.indexOf('nd') !== -1 ? date.indexOf('nd') :
      date.indexOf('rd') !== -1 ? date.indexOf('rd') :
      date.indexOf('th') !== -1 ? date.indexOf('th') : date.length
   );

   return ''.concat(date.slice(0,index),date.slice(index + 2));
}

/**
 * Merges two arrays while keeping the data
 * @param {Array} arr1 Array to use as a base for modification
 * @param {Array} arr2 Takes elements from this array; if they are not in arr1 then add them.
 * @returns {Array} Merged array
 */
export const mergeArrays = (arr1,arr2) => {
   var retArr = [];
   for (const i of arr1) if (retArr.indexOf(i) == -1) retArr.push(i);
   for (const j of arr2) if (retArr.indexOf(j) == -1) retArr.push(j);
   return retArr;
}

/**
 * Capitalizes the first letter of all words in a string that are seperated by spaces
 * @param {String} str String to capitalize
 * @returns {String} A strin with the provided words capitalized
 */
export const capitalizeWords = (str) => {
   var returnStr = '';
   for (const i of str.split(' ')) returnStr += `${i[0].toUpperCase() + i.slice(1,i.length)} `;
   if (returnStr[returnStr.length - 1] == ' ') returnStr = returnStr.slice(0,returnStr.length - 1);
   return returnStr;
}

/**
 * Sorts an array of strings alphabetically (ignores capitals)
 * @param {String[]} arr Array of strings to order
 * @returns {String[]} Array of sorted strings
 */
export const alphabeticalSort = (arr) => {
   const compare = (a, b) => {
      if (a.toLowerCase() < b.toLowerCase()) return -1;
      if (b.toLowerCase() < a.toLowerCase()) return 1;
      return 0;
   };
   return arr.sort(compare);
}
