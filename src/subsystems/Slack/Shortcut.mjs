/**Shortcut builder to listen for a specific shortcut interaction on Slack */
class Shortcut {
   #readyFunc = () => {}
   #activateFunc = () => {}
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
   /**
    * Activates the shortcut and gets it ready to operate
    * @param {Object} client Slack client to host the event listeners on
    * @param {Object} modalData Modal data used by the shortcut to perform interactions
    * @async
    */
   async activate(client,modalData){
      if (typeof modalData !== 'undefined') this.modal = modalData[this.callback_id];
      if (typeof this.#activateFunc !== 'undefined') client.shortcut(this.callback_id,this.#activateFunc);
      if (typeof this.#submit !== 'undefined') client.view(this.callback_id,this.#submit);
      if (typeof this.#close !== 'undefined') client.view({ callback_id: this.callback_id, type: 'view_closed' },this.#close);
      for (const i of Object.keys(this.#actions)){
         client.action(i,this.#actions[i]);
      }
      await this.#readyFunc();
   }
   /**
    * Sets the callback function for when the shortcut is ready and operating
    * @param {Function} callback Function to use when the event is passed
    * @returns {Shortcut}
    */
   onReady(callback){
      this.#readyFunc = callback;
      return this;
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

/*

This a shortcut wrapper to handle shortcut systems on slack. Every shortcut uses this base to operate. The reason I created
this is because it makes it easier to program and easier for the shortcut to be intialized in a proper, timely manner.

*/
