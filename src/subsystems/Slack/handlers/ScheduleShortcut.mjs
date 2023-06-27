import Shortcut from "../Shortcut.mjs";
import ConfigFile from "../../../ConfigFile.mjs";
import env from 'dotenv';

env.config({ path: './security/.env'});

const ScheduleShortcut = new Shortcut('schedule')
   //Opens the initial modal when activated
   .onActivation(async ({ shortcut, ack, client }) => {
      await ack();

      const modal = ScheduleShortcut.modal.initial;

      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         trigger_id: shortcut.trigger_id
      });
   })
   .onSubmit(async ({ ack, body }) => {
      await ack();

      console.log(body);
   })
   //When someone interacts with the period choice button; routes to correct handler
   .onAction('period_choose',async ({ ack, client, body }) => {
      await ack();
      switch (body.actions[0].selected_option.value){
         case 'day':
            await updateToDay({ client, body });
            break;
         case 'week':
            await updateToWeek({ client, body });
            break;
         case 'month':
            await updateToMonth({ client, body});
            break;
         case 'custom':
            await updateToCustom({ client, body });
            break;
      }
   })

/**Handles when the user switches to changing specific days */
const updateToDay = async ({ client, body }) => {
   const modal = ScheduleShortcut.modal.day;

   //Transfer metadata
   var metadata = JSON.parse(body.view.private_metadata);
   modal.private_metadata = JSON.stringify(Object.assign(JSON.parse(modal.private_metadata),metadata));

   //Upload modal
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      view_id: body.view.id
   });
}

/**Handles when the user switched to changing specific weeks (changes according to season) */
const updateToWeek = async ({ client, body }) => {
   const modal = ScheduleShortcut.modal.week;
   var metadata = JSON.parse(body.view.private_metadata);

   //If it hasn't already, generate the week choices that the user can choose (base on season end and start dates)
   if (!metadata.weekOptionsLoaded){
      var weeksToAdd = 8, addWeekCounter = false;
      var weeksUntilEnd = (Date.parse(ConfigFile.season_dates.end) - Date.now()) / 1000 / 60 / 60 / 24 / 7;
      var weeksFromStart = ((Date.now() - Date.parse(ConfigFile.season_dates.start)) / 1000 / 60 / 60 / 24 / 7) + 1;
      if (ConfigFile.season_dates.end !== null && weeksFromStart > 0 && weeksUntilEnd > 0){
         weeksToAdd = weeksUntilEnd;
         addWeekCounter = true;
      }
      var mondayDate = new Date();
      mondayDate.setDate(mondayDate.getDate() - mondayDate.getDay());

      for (var i = 0; i < weeksToAdd; i++){
         let str = '', option = {
            text: {
               type: 'plain_text',
               text: ''
            },
            value: ''
         };
         str += `${mondayDate.getMonth()+1}/${mondayDate.getDate()+1}/${mondayDate.getFullYear()} - `;
         mondayDate.setDate(mondayDate.getDate()+6);
         str += `${mondayDate.getMonth()+1}/${mondayDate.getDate()+1}/${mondayDate.getFullYear()}`;
         mondayDate.setDate(mondayDate.getDate()+1);
         option.value = str;
         if (addWeekCounter){
            str = `Week ${Math.ceil(weeksFromStart)}  |  ` + str;
            weeksFromStart++;
         }
         option.text.text = str;
         modal.blocks[5].accessory.options.push(option);
      }

      metadata.weekOptionsLoaded = true;
   }

   //Saves metadata and uploads modal
   modal.private_metadata = JSON.stringify(Object.assign(JSON.parse(modal.private_metadata),metadata));
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      view_id: body.view.id
   });
}

/**Handles when user switches to changing specific months (changes according to the season) */
const updateToMonth = async ({ client, body }) => {
   const modal = ScheduleShortcut.modal.month;
   var metadata = JSON.parse(body.view.private_metadata);
   
   //If it hasn't already, generate the month choices that the user can choose (base on season end and start dates)
   if (!metadata.monthOptionsLoaded){
      var monthsToAdd = 12, addMonthCounter = false;
      var monthsUntilEnd = (Date.parse(ConfigFile.season_dates.end) - Date.now()) / 1000 / 60 / 60 / 24 / 7 / 4;
      var monthsFromStart = ((Date.now() - Date.parse(ConfigFile.season_dates.start)) / 1000 / 60 / 60 / 24 / 7 / 4) + 1;
      if (ConfigFile.season_dates.end !== null && monthsFromStart > 0 && monthsUntilEnd > 0){
         monthsToAdd = monthsUntilEnd;
         addMonthCounter = true;
      }
      var currentMonth = (new Date()).getMonth() + 2;
      var index = ['Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'];
      for (var i = 0; i < monthsToAdd; i++){
         let projectionDate = new Date();
         projectionDate.setMonth(currentMonth + i);
         let option = {
            text: {
               type: 'plain_text',
               text: `${index[(currentMonth + i) % 12]} ${projectionDate.getFullYear()}`
            },
            value: `${index[(currentMonth + i) % 12]} ${projectionDate.getFullYear()}`.toLowerCase()
         };
         if (addMonthCounter){
            option.text.text = `Month ${Math.ceil(monthsFromStart)}  |  ` + option.text.text;
            monthsFromStart++;
         }
         modal.blocks[5].accessory.options.push(option);
      }
      metadata.monthOptionsLoaded = true;
   }

   //Saves metadata and uploads modal
   modal.private_metadata = JSON.stringify(Object.assign(JSON.parse(modal.private_metadata),metadata));
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      view_id: body.view.id
   });
}

/**Handles when the user switches to making custom arrangments */
const updateToCustom = async ({ client, body }) => {
   const modal = ScheduleShortcut.modal.custom;

   //Saves metadata
   var metadata = JSON.parse(body.view.private_metadata);
   modal.private_metadata = JSON.stringify(Object.assign(JSON.parse(modal.private_metadata),metadata));

   //Uploads modal
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      view_id: body.view.id
   });
}

export default ScheduleShortcut;
