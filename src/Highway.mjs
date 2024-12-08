export class Subsystem {
   /**
    * Defines a new subsystem on the system highway.
    * @param {String} name Name of the subsystem to define on the highway
    * @param {Object} obj The subsystem in its entirety; this is to get the methods of the subsystems tom reference when requests are made
    */
   constructor(name,obj){
      local.systemCatalog[name] = Object.keys(obj);
   }
}

export class SubsystemRequest {
   /**
    * Creates and sends a system request to a designated subsystem defined on the highway.
    * @param {String} system Name of the system to make the request to.
    * @param {String} method Name of the method of which the subsystem will execute.
    * @param {Array.any} params Array of parameters in order of left to right.
    * @param {Function} callback Callback function to execute when the request has been fulfilled
    */
   constructor(system,method,params,callback){
      if (Object.keys(local.systemCatalog).indexOf(system) == -1) throw new Error(`'${system}' is not a valid subsystem`);
      else if (local.systemCatalog[system].indexOf(method) == -1) throw new Error(`'${method}' is not valid method for subsystem '${system}'`);
      this.system = system;
      this.method = method;
      this.params = params;
      this.callback = callback;
      routeRequest(system,method,params,callback);
   }
}

export class RequestHandler {
   /**
    * Defines the handler function for all the subsystem requests.
    * @param {Function} onRequest Function to route all subsystem requests to their designated subsystems.
    */
   constructor(onRequest){
      local.handler = onRequest;
   }
}

var local = {
   systemCatalog: {},
   handler: null
}

const routeRequest = async (system,method,params,callback) => {
   try {
      const finish = await local.handler({system,method,params});
      await callback(finish,undefined);
   } catch(err){
      await callback(undefined,err);
   }
}

class Highway {
   /**
    * Routes a subsystem request through a promise rather than a class definition.
    * @param {String} system Name of the system to make the request to.
    * @param {String} method Name of the method of which the subsystem will execute.
    * @param {Array.any} params Array of parameters in order of left to right.
    * @returns {Promise} Promise that resolves when the request is fulfilled
    */
   static async makeRequest(system,method,params){
      return new Promise(async (resolve,reject) => {
         routeRequest(system,method,params,(ret,err) => {
            if (err) reject(err);
            else resolve(ret);
         })
      })
   }
};
Highway.Subsystem = Subsystem;
Highway.SubsystemRequest = SubsystemRequest;
Highway.RequestHandler = RequestHandler;
export default Highway;

/* 

This is the system highway. All subsystems use this highway to interface with each other. How it works is relatively simple. All the subsystems are defined
and created in the main javascript file. From there a highway handler is defined. This handler routes all subsystem requests to the subsystem they are trying
to use. After that the individual subsystems store themselves in a catalog on definition. This allows for error checking. Now all a subsystem has to do in
order to use a different subsystem's functionality is call a subsystem request to that subsystem and the highway handles the rest.

*/
