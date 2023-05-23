export const interfaceHandlers = {
   getMeshedUsers: async ({client, manifest}) => {
      var users = [];
      var slackUsers = await (async () => {
         let ret = [];
         let data = await client.client.users.list({
            token: process.env.SLACK_BOT_TOKEN
         }).then(d => d.members);
         for (const i of data){
            if (!i.is_bot && i.id !== 'USLACKBOT' && i.name.indexOf('deactivateduser') == -1) ret.push(i);
         }
         return ret;
      })();
      
      var localUsers = await manifest.UserFile.read()
         .then(d => d.data);
      for (const i of slackUsers){
         for (const j of localUsers){
            if (i.id == j.user_id) users.push({id: j.user_id, name: j.name, local: true});
            else users.push({id: i.id, name: i.real_name, local: false});
         }
      }
      return users;
   }
};
