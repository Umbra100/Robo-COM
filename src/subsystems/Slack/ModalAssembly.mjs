class ModalAssembly {
   #modals = {};
   constructor(){}

   /**
    * Creates and stores a modal function that generates a modal
    * @param {String} id ID of the modal
    * @param {callback} callback Callback function to run when the modal is called
    * @returns {ModalAssembly}
    */
   addModal(id,callback){
      if (id in this.#modals) throw new Error(`Modal with id '${id}' already exists`);
      this.#modals[id] = callback;
      return this;
   }
   /**
    * 
    * @param {String} id ID of the modal to run
    * @param  {...any} params 
    * @returns 
    */
   async getModal(id,...params){
      return await this.#modals[id](...params);
   }
}

export default ModalAssembly;
