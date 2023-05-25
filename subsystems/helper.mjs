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
         time.getHours() > 12 ? ' PM' : ' AM'
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
