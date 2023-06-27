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
    * Creates a string that notes the current date in mm/dd/yyyy form or Mon Date Year form
    * @param {Boolean} readable Whether or not to return the date in a more human readable form (mm/dd/yyyy or Mon Date Year)
    * @returns {String} A string containing a date notation
    */
   createDate: (readable = false) => {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const time = new Date();
      if (readable) return ''.concat(
            months[time.getMonth()],' ',
            time.getDate(),(
               time.getDate() == 1 || time.getDate() == 21 || time.getDate() == 31 ? 'st ' :
               time.getDate() == 2 || time.getDate() == 22 ? 'nd ' :
               time.getDate() == 3 || time.getDate() == 23 ? 'rd ' : 'th '
            ),
            time.getFullYear()
         );
      else return ''.concat(
         time.getMonth()+1,'/',
         time.getDate(),'/',
         time.getFullYear()
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
