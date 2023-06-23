/**Shortcut builder to listen for a specific shortcut interaction on Slack */
class Shortcut {
   #activateFunc
   #submit
   #close
   #actions = {}
   /**
    * Creates a class for making things easier to listen for Slack shortcut events.
    * Needs to be activated with [instance].activate() after initialization
    * @param {String} callback_id Callback ID for the shortcut
    */
   constructor(callback_id){
      this.callback_id = callback_id;
      this.modal = null;
   }
   activate(client,modalData){
      this.modal = modalData[this.callback_id];
      if (typeof this.#activateFunc !== 'undefined') client.shortcut(this.callback_id,this.#activateFunc);
      if (typeof this.#submit !== 'undefined') client.view(this.callback_id,this.#submit);
      if (typeof this.#close !== 'undefined') client.view({ callback_id: this.callback_id, type: 'view_closed' },this.#close);
      for (const i of Object.keys(this.#actions)){
         client.action(i,this.#actions[i]);
      }
   }
   /**
    * Sets the callback function for when the shortcut is activated 
    * @param {Function} callback Function to use when the event is passed
    * @returns {Shortcut}
    */
   onActivation(callback){
      this.#activateFunc = callback;
      return this;
   }
   /**
    * Sets the callback function for when the modal is submitted
    * @param {Function} callback Function to use when the event is passed
    * @returns {Shortcut}
    */
   onSubmit(callback){
      this.#submit = callback;
      return this;
   }
   /**
    * Sets the callback function for when the modal is closed (modal must have the 'notify_on_close' property set to true)
    * @param {Function} callback Function to use when the event is passed
    * @returns {Shortcut}
    */
   onClose(callback){
      this.#close = callback;
      return this;
   }
   /**
    * Sets the callback function for when an action is done on the modal such as a button being pressed
    * @param {String} action_id Action ID for the targetted block in the modal
    * @param {Function} callback Function to use when the event is passed
    * @returns {Shortcut}
    */
   onAction(action_id,callback){
      this.#actions[action_id] = callback;
      return this;
   }
}

export default Shortcut;
