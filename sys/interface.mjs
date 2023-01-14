import { JSONFile } from "./util/directory.mjs";

const Catalog = {
  Commands: {
    notify: async ({ payload, manifest, client }) => {
      var uidata = await manifest.UIFile.getViewData('notifyCommand');
      uidata.trigger_id = payload.body.trigger_id;

      await client.client.views.open(uidata);
      return {Result: 'SUCCESS'};
    },
    register: async ({ payload, manifest, client }) => {
      //todo - Make initial value set to user data
      var userData = await manifest.UserFile.getUserData(payload.body.user_id);
      var uidata = await manifest.UIFile.getViewData('register');
      var alternations = await manifest.UIFile.read()
         .then(data => data.register.alternations[0].options);

      const data = await manifest.ConfigFile.read()
         .then(d => d.availableTeams);
      uidata.view.blocks[2].element.options = [];
      for (const i of data){
         uidata.view.blocks[2].element.options.push({
            text: {
               type: 'plain_text',
               text: i
            },
            value: i
         });
      }


      if (typeof userData !== 'undefined'){
         if (userData.name !== null) uidata.view.blocks[0].element.initial_value = userData.name;
         if (userData.phone !== null) uidata.view.blocks[1].element.initial_value = userData.phone;
         if (userData.team !== null){
            uidata.view.blocks[2].element.initial_option = {
               text: {type: 'plain_text', text: userData.team},
               value: userData.team
            };
         }
      }

      uidata.view.blocks[4].accessory = (userData?.notifications ?? true) ? alternations.yes : alternations.no;
      uidata.trigger_id = payload.body.trigger_id;
      const reply = await client.client.views.open(uidata);
      return {Result: 'SUCCESS'};
    },
    shutdown: async ({ payload, manifest, client }) => {
      const uidata = await manifest.UIFile.getViewData('shutdown');
      uidata.trigger_id = payload.body.trigger_id;

      await client.client.views.open(uidata);
      return {Result: 'Command Sent'};
    }
  },
  MessageShortcuts: {
    notify: async ({payload, manifest, client}) => {
      var uidata = await manifest.UIFile.getViewData('notifyShortcut');
      uidata.view.blocks[2].element.initial_value = payload.body.message.text;

      var metadata = {
         channel: payload.shortcut.channel,
         message_ts: payload.shortcut.message_ts,
         hasFiles: typeof payload.shortcut.message.files !== 'undefined'
      }
      uidata.view.private_metadata = JSON.stringify(metadata);

      uidata.trigger_id = payload.body.trigger_id;
      await client.client.views.open(uidata);
      return {Result: 'SUCCESS'};
    }
  },
  Shortcuts: {},
  keys: {
    ui: ['notificationInput','recipientButtonInput']
  }
};

const helper = {
   UI: new JSONFile('./sys/ui.json')
}

export default Catalog;
