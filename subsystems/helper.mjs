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
