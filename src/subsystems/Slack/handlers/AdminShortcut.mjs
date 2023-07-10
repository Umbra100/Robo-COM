import Shortcut from '../Shortcut.mjs';
import ModalAssembly from '../ModalAssembly.mjs';
import ConfigFile, { waitForChange, ConfigJSON } from '../../../ConfigFile.mjs';
import env from 'dotenv';

env.config({ path: './security/.env' });

/**Handles all shortcut interaction with the admin controls */
const AdminShortcut = new Shortcut('admin')
   //Uploads initial admin panel when shortcut is called
   .onActivation(async ({ shortcut, ack, client }) => {
      await ack();
      //Get and upload modal
      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('initial'),
         trigger_id: shortcut.trigger_id
      });
   })
   //Routes submissions to the correct handlers
   .onSubmit(async ({ ack, body }) => {
      await ack();
      const metadata = JSON.parse(body.view.private_metadata);
      switch (metadata.submitType){
         case 'season_dates':
            await seasonDatesSubmitEvent({ body });
            break;
      }
   })
   //Uploads season date changing modal when that configuration button is pressed
   .onAction('admin_change_season_dates',async ({ ack, client, body }) => {
      await ack();
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('season_dates'),
         view_id: body.view.id
      });
   })

/**Handles all modal creation and assembly */
export const Assembly = new ModalAssembly()
   //Modal creation for initial modal 
   .addModal('initial', () => JSON.parse(JSON.stringify(AdminShortcut.modal.initial)))
   //Modal creation for season dates modal 
   .addModal('season_dates', () => {
      var modal = JSON.parse(JSON.stringify(AdminShortcut.modal.season_dates));
      if (ConfigFile.season_dates.start !== null) modal.blocks[2].element.initial_date = ConfigFile.season_dates.start;
      if (ConfigFile.season_dates.end !== null) modal.blocks[3].element.initial_date = ConfigFile.season_dates.end;
      return modal;
   })

/**Handles submissions for the season date changing */
const seasonDatesSubmitEvent = async ({ body }) => {
   //If the settings did not change; return
   if (body.view.state.values.startDate.action.selected_date == ConfigFile.season_dates.start && body.view.state.values.endDate.action.selected_date == ConfigFile.season_dates.end) return;
   //Stores the season dates in the config file
   await ConfigJSON.writePath('season_dates',{
      start: body.view.state.values.startDate.action.selected_date,
      end: body.view.state.values.endDate.action.selected_date
   });
   await waitForChange();
}

export default AdminShortcut;
