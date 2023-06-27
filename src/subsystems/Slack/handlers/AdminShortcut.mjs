import Shortcut from '../Shortcut.mjs';
import ConfigFile, { waitForChange, ConfigJSON } from '../../../ConfigFile.mjs';
import env from 'dotenv';

env.config({ path: './security/.env' });

/**Handles all shortcut interaction with the admin controls */
const AdminShortcut = new Shortcut('admin')
   //Uploads initial admin panel when shortcut is called
   .onActivation(async ({ shortcut, ack, client }) => {
      await ack();

      const modal = AdminShortcut.modal.initial;
      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         trigger_id: shortcut.trigger_id
      });
   })
   //Routes submissions to the correct handlers
   .onSubmit(async ({ ack, body }) => {
      await ack();
      const metadata = JSON.parse(body.view.private_metadata);
      switch (metadata.submitType){
         case 'season_dates':
            await seasonDatesSubmitHandler({ body });
            break;
      }
   })
   //Uploads season date changing modal when that panel button is pressed
   .onAction('admin_change_season_dates',async ({ ack, client, body }) => {
      await ack();

      var modal = AdminShortcut.modal.season_dates;
      if (ConfigFile.season_dates.start !== null) modal.blocks[2].element.initial_date = ConfigFile.season_dates.start;
      if (ConfigFile.season_dates.end !== null) modal.blocks[3].element.initial_date = ConfigFile.season_dates.end;

      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   })

/**Handles submissions for the season date changing */
const seasonDatesSubmitHandler = async ({ body }) => {
   if (body.view.state.values.startDate.action.selected_date == ConfigFile.season_dates.start && body.view.state.values.endDate.action.selected_date == ConfigFile.season_dates.end) return;
   await ConfigJSON.writePath('season_dates',{
      start: body.view.state.values.startDate.action.selected_date,
      end: body.view.state.values.endDate.action.selected_date
   });
   await waitForChange();
}

export default AdminShortcut;
