import Shortcut from "../Shortcut.mjs";
import ModalAssembly from "../ModalAssembly.mjs";
import ConfigFile from "../../../ConfigFile.mjs";
import Highway from "../../../Highway.mjs";
import RegisterAlert from "./RegisterAlert.mjs";
import env from 'dotenv';
import { clockFormatter, removeOrdinalIndicator, mergeArrays, terminalFormatter } from "../../../helper.mjs";

env.config({ path: './security/.env' });

var scheduleFile, scheduleData, userFile, userData;

/**Scheduling shortcut handler */
const ScheduleShortcut = new Shortcut('schedule')
   //When shortcut is initialized, get schedule and user data
   .onReady(async () => {
      //Get user file
      userFile = await Highway.makeRequest('Local', 'getFile', ['./data/users.json']);
      //Get schedule file
      scheduleFile = await Highway.makeRequest('Local', 'getFile', ['./data/scheduling.json']);
   })
   //Opens the initial modal when shortcut is activated
   .onActivation(async ({ shortcut, ack, client }) => {
      await ack();
      //If the user is not registered; alert them for registration
      if (!await RegisterAlert.check(shortcut.user.id)) {
         await RegisterAlert.alert({ shortcut, ack, client });
         return;
      }
      //Gets and uploads the modal data
      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('initial'),
         trigger_id: shortcut.trigger_id
      });
   })
   //When the shortcut is submitted; check for any overlap and store the schedule data
   .onSubmit(async (pkg) => {
      var data = null, { body, ack } = pkg;
      //Gets the schedule data from the submitted modal
      const scheduleType = JSON.parse(body.view.private_metadata).scheduleType;
      //Evaluates and formats date input data (except for configuration; routes to those handlers instead)
      switch (scheduleType) {
         case 'day':
            data = evaluateInput.day({ body });
            break;
         case 'week':
            data = evaluateInput.week({ body });
            break;
         case 'month':
            data = evaluateInput.month({ body });
            break;
         case 'custom':
            data = evaluateInput.custom({ body });
            break;
         case 'day_config':
            await configDaySubmitEvent(pkg);
            return;
         case 'period_config':
            await configPeriodSubmitEvent(pkg);
            return;
         default:
            await ack();
            return;
      }

      //Processes schedule data and checks for any overlaps
      scheduleData = await scheduleFile.read();
      var userScheduleData = JSON.parse(JSON.stringify(scheduleData[body.user.id]));
      var checkCompile = { check: false, periods: [], days: [] };
      //Checks for overlap in absent periods
      for (const i of data.periods.absent) {
         let scan = checkDateOverlap({ date: i, type: 'period', location: 'both', userId: body.user.id });
         if (scan.check) {
            checkCompile.check = true;
            for (const ia of scan.periods) if (checkCompile.periods.indexOf(ia) == -1) checkCompile.periods.push(ia);
            for (const ib of scan.days) if (checkCompile.days.indexOf(ib) == -1) checkCompile.days.push(ib);
         } else userScheduleData.periods.absent.push(i);
      }
      //Checks for overlap in recieving notebook periods
      for (const j of data.periods.recieve_notebook) {
         let scan = checkDateOverlap({ date: j, type: 'period', location: 'both', userId: body.user.id });
         if (scan.check) {
            checkCompile.check = true;
            for (const ja of scan.periods) if (checkCompile.periods.indexOf(ja) == -1) checkCompile.periods.push(ja);
            for (const jb of scan.days) if (checkCompile.days.indexOf(jb) == -1) checkCompile.days.push(jb);
         } else userScheduleData.periods.recieve_notebook.push(j);
      }
      //Checks for overlap in absent days
      for (const k of data.days.absent) {
         let scan = checkDateOverlap({ date: k, type: 'day', location: 'both', userId: body.user.id });
         if (scan.check) {
            checkCompile.check = true;
            for (const ka of scan.periods) if (checkCompile.periods.indexOf(ka) == -1) checkCompile.periods.push(ka);
            for (const kb of scan.days) if (checkCompile.days.indexOf(kb) == -1) checkCompile.days.push(kb);
         } else userScheduleData.days.absent.push(k);
      }
      //Checks for overlap in recieving notebook days
      for (const l of data.days.recieve_notebook) {
         let scan = checkDateOverlap({ date: l, type: 'day', location: 'both', userId: body.user.id });
         if (scan.check) {
            checkCompile.check = true;
            for (const la of scan.periods) if (checkCompile.periods.indexOf(la) == -1) checkCompile.periods.push(la);
            for (const lb of scan.days) if (checkCompile.days.indexOf(lb) == -1) checkCompile.days.push(lb);
         } else userScheduleData.days.recieve_notebook.push(l);
      }
      //Overwrites the extended data for the time periods
      Object.assign(userScheduleData.periods.extended, data.periods.extended);

      var str = '';
      //If there is overlap; send them an error
      if (checkCompile.check) {
         //Assembles the error string. It describes what days/periods are overlapping
         let errors = {};
         for (const m of checkCompile.periods) str += `'${m}', `;
         for (const n of checkCompile.days) str += `'${n}', `;
         str = ''.concat(str.slice(0, str.lastIndexOf(',')), str.slice(str.lastIndexOf(',') + 1, str.length));
         if (checkCompile.days.length + checkCompile.periods.length > 1) str = ''.concat(str.slice(0, str.lastIndexOf(',') + 1), ' and', str.slice(str.lastIndexOf(',') + 1, str.length));
         if (checkCompile.days.length + checkCompile.periods.length == 2) str = ''.concat(str.slice(0, str.lastIndexOf(',')), str.slice(str.lastIndexOf(',') + 1, str.length));
         if (checkCompile.days.length + checkCompile.periods.length == 1) str += ' is ';
         else str += ' are ';
         str += 'already scheduled. If you want to change your scheduling, execute the scheduling shortcut again.';

         //Depending on the submitted schedule type, send the error to specific input blocks
         switch (scheduleType) {
            case 'day':
               errors['datepicker'] = str;
               break;
            case 'week':
               errors['chosen_notebook_weekdays'] = str;
               break;
            case 'month':
               errors['reason'] = str;
               break;
            case 'custom':
               errors['to_date'] = str;
               break;
         }

         //Sends the error
         await ack({
            response_action: 'errors',
            errors
         });
         return;
         //If there is no overlap, log and store the new schedule data
      } else {
         //Assmbles the logging string. Describes what the user scheduled
         let periods = mergeArrays(data.periods.absent, data.periods.recieve_notebook);
         let days = mergeArrays(data.days.absent, data.days.recieve_notebook);
         for (const m of periods) str += `'${m}', `;
         for (const n of days) str += `'${n}', `;
         str = ''.concat(str.slice(0, str.lastIndexOf(',')), str.slice(str.lastIndexOf(',') + 1, str.length));
         if (days.length + periods.length > 1) str = ''.concat(str.slice(0, str.lastIndexOf(',') + 1), ' and', str.slice(str.lastIndexOf(',') + 1, str.length));
         if (days.length + periods.length == 2) str = ''.concat(str.slice(0, str.lastIndexOf(',')), str.slice(str.lastIndexOf(',') + 1, str.length));

         //Acknowledges the submission and stores the data in the local file.
         await ack();
         await scheduleFile.writePath(body.user.id, userScheduleData);

         //Logs the scheduling action
         userData = await userFile.read();
         str = `User '${userData[body.user.id].slack_name}' (${userData[body.user.id].name}) has made a schedule entry for ${str}`;
         await Highway.makeRequest('Local', 'log', [str]);
         console.log(terminalFormatter.bulletPoint, str);
      }
   })
   //When someone interacts with the time basis choose dropdown; routes to correct time basis
   .onAction('period_choose', async ({ ack, client, body }) => {
      await ack();
      var modal;
      //Gets modal based on what basis the user chooses
      switch (body.actions[0].selected_option.value) {
         case 'day':
            modal = await Assembly.getModal('day');
            break;
         case 'week':
            modal = await Assembly.getModal('week');
            break;
         case 'month':
            modal = await Assembly.getModal('month');
            break;
         case 'custom':
            modal = await Assembly.getModal('custom');
            break;
      }
      //Uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   })
   //Handles the interaction for when the user selects an option from the time basis dropdown on the initial modal
   .onAction('initial_period_choose', async ({ ack, body, client }) => {
      await ack();
      //Gets and ploads the modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('initial_basis_choose', { body }),
         view_id: body.view.id
      });
   })
   //Handles when someone presses the button to go their selected time basis
   .onAction('initial_go_to_scheduling', async ({ ack, body, client }) => {
      await ack();
      //Gets the block id of the dropdown
      var dropdownBlockId = Object.keys(body.view.state.values)[0], modal;
      //If the user has not filled out the static select menu, get the modal data that contains an error for such
      if (body.view.state.values[dropdownBlockId].initial_period_choose.selected_option == null) {
         modal = await Assembly.getModal('initial_required_field_error');
      //If the user has filled out the static select menu, get the modal data for the designated basis
      } else switch (body.view.state.values[dropdownBlockId].initial_period_choose.selected_option.value) {
         case 'day':
            modal = await Assembly.getModal('day');
            break;
         case 'week':
            modal = await Assembly.getModal('week');
            break;
         case 'month':
            modal = await Assembly.getModal('month');
            break;
         case 'custom':
            modal = await Assembly.getModal('custom');
            break;
      }

      //Uploads the modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   })
   //Handles when user presses the button to go to schedule configuration
   .onAction('initial_go_to_schedule_config', async (pkg) => updateToConfig(pkg))
   //Handles when a person click to change/config a schedule entry
   .onAction('date_config_action', async ({ ack, body, client }) => {
      await ack();
      //Get data of the date entry
      var entryMetadata = JSON.parse(body.actions[0].value), modal;
      //Get the modal data depending on the schedule entry type
      switch (entryMetadata.type) {
         case 'day':
            modal = await Assembly.getModal('config_day', { body });
            break;
         case 'period':
            modal = await Assembly.getModal('config_period', { body });
            break;
      }
      //Uploads the modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   })
   //Handles the back button on config menus; routes to config menu
   .onAction('config_back', async (pkg) => updateToConfig(pkg))
   //Handles when the user clicks to delete a day schedule entry
   .onAction('config_delete_day',async ({ ack, body, client }) => {
      await ack();

      //Gets metadata and if the day is already deleted, return
      const metadata = JSON.parse(body.view.private_metadata);
      if (metadata.deleted) return;

      //Modifies schedule data to delete the day entry
      scheduleData = await scheduleFile.read();
      var userSchedule = JSON.parse(JSON.stringify(scheduleData[body.user.id].days));
      if (metadata.date.absent){
         let index = userSchedule.absent.indexOf(metadata.date.date);
         userSchedule.absent = [].concat(userSchedule.absent.slice(0,index),userSchedule.absent.slice(index+1,userSchedule.absent.length));
      }
      if (metadata.date.recieve_notebook){
         let index = userSchedule.recieve_notebook.indexOf(metadata.date.date);
         userSchedule.recieve_notebook = [].concat(userSchedule.recieve_notebook.slice(0,index),userSchedule.recieve_notebook.slice(index+1,userSchedule.recieve_notebook.length));
      }

      //Saves schedule data to app
      scheduleData[body.user.id].days.absent = userSchedule.absent;
      scheduleData[body.user.id].days.recieve_notebook = userSchedule.recieve_notebook;
      await scheduleFile.writePath(`${body.user.id}.days`,{
         absent: userSchedule.absent,
         recieve_notebook: userSchedule.recieve_notebook
      });

      //Gets and uploads the modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('config_day_delete', { body }),
         view_id: body.view.id
      });
   })
   //Handles when the user click to delete a period schedule entry
   .onAction('config_delete_period',async ({ ack, body, client }) => {
      await ack();

      //Gets metadata and if the period is already deleted, return
      const metadata = JSON.parse(body.view.private_metadata);
      if (metadata.deleted) return;

      //Modifies schedule data to delete the period entry
      scheduleData = await scheduleFile.read();
      var userSchedule = JSON.parse(JSON.stringify(scheduleData[body.user.id].periods));
      if (metadata.date.absent){
         let index = userSchedule.absent.indexOf(metadata.date.date);
         userSchedule.absent = [].concat(userSchedule.absent.slice(0,index),userSchedule.absent.slice(index+1,userSchedule.absent.length));
      }
      if (metadata.date.recieve_notebook){
         let index = userSchedule.recieve_notebook.indexOf(metadata.date.date);
         userSchedule.recieve_notebook = [].concat(userSchedule.recieve_notebook.slice(0,index),userSchedule.recieve_notebook.slice(index+1,userSchedule.recieve_notebook.length));
      }
      if (typeof userSchedule.extended[metadata.date.date] !== 'undefined'){
         let extended = {};
         for (const i in userSchedule.extended){
            if (i !== metadata.date.date) extended[i] = userSchedule.extended[i];
         }
         userSchedule.extended = extended;
      }

      //Saves schedule data to app
      scheduleData[body.user.id].periods.absent = userSchedule.absent;
      scheduleData[body.user.id].periods.recieve_notebook = userSchedule.recieve_notebook;
      scheduleData[body.user.id].periods.extended = userSchedule.extended;
      await scheduleFile.writePath(`${body.user.id}.periods`,{
         absent: userSchedule.absent,
         recieve_notebook: userSchedule.recieve_notebook,
         extended: userSchedule.extended
      });

      //Gets and uploads the modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('config_period_delete', { body }),
         view_id: body.view.id
      });
   })
   //Handles checking the time length of custom time basis to see if they need to provide a reason for their absence
   .onAction('from_date_action', async (pkg) => customActionDateEvent(pkg))
   .onAction('to_date_action', async (pkg) => customActionDateEvent(pkg))
   .onAction('checkbox_action', async (pkg) => customActionDateEvent(pkg))
   //Handles checking the time length to see if they need to provied a reason for their absence (when configuring a current entry)
   .onAction('config_from_date_action', async (pkg) => configActionDateEvent(pkg))
   .onAction('config_to_date_action', async (pkg) => configActionDateEvent(pkg))
   .onAction('config_checkbox_action', async (pkg) => configActionDateEvent(pkg))
   //Acknowledges any actions that don't have an event tied to them
   .onAction('action', async ({ ack }) => ack());

/**Handles all modal creation and assembly */
export const Assembly = new ModalAssembly()
   //Modal creation for the initial activation modal
   .addModal('initial',() => JSON.parse(JSON.stringify(ScheduleShortcut.modal.initial)))
   //Modal creation for showing the tooltip when a user chooses a time basis
   .addModal('initial_basis_choose', async ({ body }) => {
      //Gets the original modal data
      var modal = await Assembly.getModal('initial'), context = '';
      //Modifies the modal; adds context depending on the selection, changes color of go button
      modal.blocks[4].elements[0].initial_option = body.actions[0].selected_option;
      modal.blocks[4].elements[1].style = 'primary';
      switch (body.actions[0].selected_option.value) {
         case 'day':
            context = 'This is used to schedule a single day out of the calender.';
            break;
         case 'week':
            context = 'Week scheduling is used to schedule out the days of a specific week.';
            break;
         case 'month':
            context = 'This is used to schedule out a whole month at one time. Please note that confirmation is required with this type of scheduling.';
            break;
         case 'custom':
            context = 'Custom scheduling is used to schedule out a custom time period from one date to another.';
            break;
      }
      modal.blocks = [].concat(modal.blocks.slice(0, 5), [{
         type: 'context',
         elements: [
            {
               type: 'plain_text',
               text: context
            }
         ]
      }], modal.blocks.slice(5, modal.blocks.length));
      return modal;
   })
   //Modal creation for showing an error if a time basis has not been chosen
   .addModal('initial_required_field_error', async () => {
      //Gets the original modal data
      var modal = await Assembly.getModal('initial');
      //Modify modal; add the required field error
      modal.blocks[4].elements[1].style = 'danger';
      modal.blocks = [].concat(modal.blocks.slice(0, 5), [{
         type: 'context',
         elements: [
            {
               type: 'plain_text',
               text: '⭕️  This field is required  ⭕️'
            }
         ]
      }], modal.blocks.slice(5, modal.blocks.length));
      return modal;
   })
   //Modal creation for the day time basis
   .addModal('day',() => JSON.parse(JSON.stringify(ScheduleShortcut.modal.day)))
   //Modal creation for the week time basis
   .addModal('week',() => {
      //Get original modal data
      var modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.week));
      //Modify modal; generate the week choices that the user can choose (base on season end and start dates)
      modal.blocks[5].accessory.options = [];
      var weeksToAdd = 8, addWeekCounter = false;
      var weeksUntilEnd = (Date.parse(ConfigFile.season_dates.end) - Date.now()) / 1000 / 60 / 60 / 24 / 7;
      var weeksFromStart = ((Date.now() - Date.parse(ConfigFile.season_dates.start)) / 1000 / 60 / 60 / 24 / 7) + 1;
      if (ConfigFile.season_dates.end !== null && weeksFromStart > 0 && weeksUntilEnd > 0) {
         weeksToAdd = weeksUntilEnd;
         addWeekCounter = true;
      }
      var mondayDate = new Date();
      mondayDate.setDate(mondayDate.getDate() - mondayDate.getDay());
      for (var i = 0; i < weeksToAdd; i++) {
         let str = '', option = {
            text: {
               type: 'plain_text',
               text: ''
            },
            value: ''
         };
         str += `${mondayDate.getMonth() + 1}/${mondayDate.getDate() + 1}/${mondayDate.getFullYear()} - `;
         mondayDate.setDate(mondayDate.getDate() + 6);
         str += `${mondayDate.getMonth() + 1}/${mondayDate.getDate() + 1}/${mondayDate.getFullYear()}`;
         mondayDate.setDate(mondayDate.getDate() + 1);
         option.value = str;
         if (addWeekCounter) {
            str = `Week ${Math.ceil(weeksFromStart)}  |  ` + str;
            weeksFromStart++;
         }
         option.text.text = str;
         modal.blocks[5].accessory.options.push(option);
      }
      return modal;
   })
   //Modal creation for the month time basis
   .addModal('month',() => {
      //Get original modal data
      var modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.month));
      //Generate the month choices that the user can choose (based on season end and start dates)
      modal.blocks[5].accessory.options = [];
      var monthsToAdd = 12, addMonthCounter = false;
      var monthsUntilEnd = (Date.parse(ConfigFile.season_dates.end) - Date.now()) / 1000 / 60 / 60 / 24 / 7 / 4;
      var monthsFromStart = ((Date.now() - Date.parse(ConfigFile.season_dates.start)) / 1000 / 60 / 60 / 24 / 7 / 4) + 1;
      if (ConfigFile.season_dates.end !== null && monthsFromStart > 0 && monthsUntilEnd > 0) {
         monthsToAdd = monthsUntilEnd;
         addMonthCounter = true;
      }
      var currentMonth = (new Date()).getMonth() + 2;
      var index = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
      for (var i = 0; i < monthsToAdd; i++) {
         let projectionDate = new Date();
         projectionDate.setMonth(currentMonth + i);
         let option = {
            text: {
               type: 'plain_text',
               text: `${index[(currentMonth + i) % 12]} ${projectionDate.getFullYear()}`
            },
            value: `${index[(currentMonth + i) % 12]} ${projectionDate.getFullYear()}`.toLowerCase()
         };
         if (addMonthCounter) {
            option.text.text = `Month ${Math.ceil(monthsFromStart)}  |  ` + option.text.text;
            monthsFromStart++;
         }
         modal.blocks[5].accessory.options.push(option);
      }
      return modal;
   })
   //Modal creation for the custom time basis
   .addModal('custom',() => JSON.parse(JSON.stringify(ScheduleShortcut.modal.custom)))
   //Modal creation for when the user chooses a time basis that requires a reason for absence
   .addModal('custom_reason_input',async () => {
      //Gets modal data and metadata
      var modal = await Assembly.getModal('custom');
      var metadata = JSON.parse(modal.private_metadata);
      //Modifies modal; adds input field
      modal.blocks.push({
         type: "input",
         block_id: "custom_reason",
         element: {
            type: "plain_text_input",
            multiline: true,
            action_id: "action",
            placeholder: {
               type: "plain_text",
               text: "Please provide the reason for your absence",
            },
         },
         label: {
            type: "plain_text",
            text: "Reason",
         },
      });
      //Modify and save metadata
      metadata.reasonAdded = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user chooses to go to the schedule config menu
   .addModal('config',async ({ body }) => {
      //Gets original modal data and user schedule data
      var modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.config));
      scheduleData = await scheduleFile.read();
      const userScheduleData = scheduleData[body.user.id];
      //Modifies the modal data; adds existing schedule periods and days
      //If the user does not have anything scheduled; don't change the modal
      if (userScheduleData.periods.absent.length + userScheduleData.periods.recieve_notebook.length > 0 || userScheduleData.days.absent.length + userScheduleData.days.recieve_notebook.length > 0) modal.blocks.pop();
      //If the user has periods scheduled, add them to the modal
      if (userScheduleData.periods.absent.length + userScheduleData.periods.recieve_notebook.length > 0) {
         let added = [];
         //Add the header
         modal.blocks.push({
            type: 'section',
            text: {
               type: 'mrkdwn',
               text: '*Periods*'
            }
         });
         /**Creates the block that contains the period */
         const makePeriod = (period) => {
            var meta = {
               date: period,
               type: 'period',
               absent: userScheduleData.periods.absent.indexOf(period) !== -1,
               recieve_notebook: userScheduleData.periods.recieve_notebook.indexOf(period) !== -1
            };
            return {
               type: 'section',
               text: {
                  type: 'mrkdwn',
                  text: `\n>${period.replace(' - ', '  -  ')}`
               },
               accessory: {
                  type: 'button',
                  text: {
                     type: 'plain_text',
                     text: 'Change'
                  },
                  action_id: 'date_config_action',
                  value: JSON.stringify(meta)
               }
            }
         }
         //Adds absent periods
         for (const i of userScheduleData.periods.absent) {
            if (added.indexOf(i) == -1) {
               modal.blocks.push(makePeriod(i));
               added.push(i);
            }
         }
         //Adds notebook periods
         for (const j of userScheduleData.periods.recieve_notebook) {
            if (added.indexOf(j) == -1) {
               modal.blocks.push(makePeriod(j));
               added.push(j);
            }
         }
      }
      //If the user has days scheduled, add them to the modal
      if (userScheduleData.days.absent.length + userScheduleData.days.recieve_notebook.length > 0) {
         let added = [];
         //Add the header
         modal.blocks.push({
            type: 'section',
            text: {
               type: 'mrkdwn',
               text: '*Days*'
            }
         });
         /**Creates the block that contains the day */
         const makeDay = (day) => {
            var meta = {
               date: day,
               type: 'day',
               absent: userScheduleData.days.absent.indexOf(day) !== -1,
               recieve_notebook: userScheduleData.days.recieve_notebook.indexOf(day) !== -1
            }
            return {
               type: 'section',
               text: {
                  type: 'mrkdwn',
                  text: `\n>${day}`
               },
               accessory: {
                  type: 'button',
                  text: {
                     type: 'plain_text',
                     text: 'Change'
                  },
                  action_id: 'date_config_action',
                  value: JSON.stringify(meta)
               }
            }
         }
         //Adds absent days
         for (const i of userScheduleData.days.absent) {
            if (added.indexOf(i) == -1) {
               modal.blocks.push(makeDay(i, 'absent'));
               added.push(i);
            }
         }
         //Adds notebook days
         for (const j of userScheduleData.days.recieve_notebook) {
            if (added.indexOf(j) == -1) {
               modal.blocks.push(makeDay(j, 'recieve_notebook'));
               added.push(j);
            }
         }
      }
      return modal;
   })
   //Modal creation for when the user chooses to change/config a day schedule entry
   .addModal('config_day',async ({ body }) => {
      //Gets original modal data and schedule entry data
      var modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.day_config));
      const entryMetadata = JSON.parse(body.actions[0].value);
      //Modifies/saves metadata
      modal.private_metadata = JSON.stringify({
         scheduleType: 'day_config',
         date: entryMetadata,
         deleted: false,
         checkboxWarningSent: false
      });
      //Modifies modal data; adds existing information about schdule entry
      //Selects checkboxes based on current schedule data
      if (!entryMetadata.absent || entryMetadata.recieve_notebook) modal.blocks[4].element.initial_options = [];
      if (!entryMetadata.absent) {
         modal.blocks[4].element.initial_options.push({
            text: {
               type: 'mrkdwn',
               text: 'I am going to be at robotics this day.',
            },
            value: 'attending'
         });
      }
      if (entryMetadata.recieve_notebook) {
         modal.blocks[4].element.initial_options.push({
            text: {
               type: 'mrkdwn',
               text: 'I would like to recieve the engineering notebook log for this day.',
            },
            value: 'recieve_notebook'
         });
      }
      //Selects date based on current schedule data
      var date = new Date(removeOrdinalIndicator(entryMetadata.date));
      modal.blocks[3].element.initial_date = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      return modal;
   })
   //Modal creation for when the user chooses to delete a day schedule entry
   .addModal('config_day_delete', ({ body }) => {
      //Get original modal data and existing metadata
      var modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.day_config));
      var metadata = JSON.parse(body.view.private_metadata);
      //Modify modal; add context saying the entry has been deleted
      modal.blocks.push({
         type: "context",
         elements: [
            {
               type: "mrkdwn",
               text: "*Schedule entry has now been deleted. You can exit the menu.*",
            }
         ]
      });
      //Modify and save metadata
      metadata.deleted = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user chooses to change/config a period schedule entry
   .addModal('config_period',async ({ body }) => {
      //Gets original modal data and schedule entry data
      var modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.custom_config));
      const entryMetadata = JSON.parse(body.actions[0].value);

      //Modifies modal data; adds existing entry information
      //Selects checkboxes based on current schedule data
      if (!entryMetadata.absent || entryMetadata.recieve_notebook) modal.blocks[5].element.initial_options = [];
      if (!entryMetadata.absent) {
         modal.blocks[5].element.initial_options.push({
            text: {
               type: "mrkdwn",
               text: "I am going to be at robotics during this period.",
            },
            value: "attending",
         });
      }
      if (entryMetadata.recieve_notebook) {
         modal.blocks[5].element.initial_options.push({
            text: {
               type: 'mrkdwn',
               text: 'I would like to recieve the engineering notebook log for each day (sends daily).',
            },
            value: 'recieve_notebook'
         });
      }

      //Selects dates based on current schedule data
      const pStart = new Date(removeOrdinalIndicator(entryMetadata.date.split(' - ')[0]));
      const pEnd = new Date(removeOrdinalIndicator(entryMetadata.date.split(' - ')[1]));
      const dist = (Date.parse(pEnd) - Date.parse(pStart)) / 1000 / 60 / 60 / 24;
      modal.blocks[3].element.initial_date = `${pStart.getFullYear()}-${pStart.getMonth() + 1}-${pStart.getDate()}`;
      modal.blocks[4].element.initial_date = `${pEnd.getFullYear()}-${pEnd.getMonth() + 1}-${pEnd.getDate()}`;

      //If time duration is above specified amount; add and fill in the reason field
      if (dist >= ConfigFile.reason_for_absence_threshold) {
         scheduleData = await scheduleFile.read();
         let popped = modal.blocks.pop();
         modal.blocks.push({
            type: "input",
            block_id: "custom_reason",
            element: {
               type: "plain_text_input",
               multiline: true,
               action_id: "action",
               placeholder: {
                  type: "plain_text",
                  text: "Please provide the reason for your absence",
               }
            },
            label: {
               type: "plain_text",
               text: "Reason",
            },
         });
         if (typeof scheduleData[body.user.id].periods.extended[entryMetadata.date]?.reason !== 'undefined'){
            modal.blocks[modal.blocks.length-1].element.initial_value = scheduleData[body.user.id].periods.extended[entryMetadata.date]?.reason;
         }
         modal.blocks.push(popped);
      }

      //Modifies/saves metadata
      modal.private_metadata = JSON.stringify({
         scheduleType: 'period_config',
         date: entryMetadata,
         deleted: false,
         reasonAdded: dist >= ConfigFile.reason_for_absence_threshold,
         checkboxWarningSent: false
      });
      return modal;
   })
   //Modal creation for when the user changes the existing start and end date to a length that requires a reason
   .addModal('config_period_reason_input', async ({ body }) => {
      //Gets original modal data and existing metadata
      var modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.custom_config));
      var metadata = JSON.parse(body.view.private_metadata);

      //Modify modal data; adds the reason input field
      var popped = modal.blocks.pop();
      modal.blocks.push({
         type: "input",
         block_id: "custom_reason",
         element: {
            type: "plain_text_input",
            multiline: true,
            action_id: "action",
            placeholder: {
               type: "plain_text",
               text: "Please provide the reason for your absence",
            },
         },
         label: {
            type: "plain_text",
            text: "Reason",
         },
      });
      modal.blocks.push(popped);
      //Modify and save metadata
      metadata.reasonAdded = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })
   //Modal creation for when the user chooses to delete a period schedule entry
   .addModal('config_period_delete',({ body }) => {
      //Get the original modal data and existing metadata
      var modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.custom_config));
      var metadata = JSON.parse(body.view.private_metadata);
      //Modify modal data; add context saying that the entry has been deleted, if the user had a reason provided then don't delete the reason  entry
      if (metadata.reasonAdded){
         let popped = modal.blocks.pop();
         modal.blocks.push({
            type: "input",
            block_id: "custom_reason",
            element: {
               type: "plain_text_input",
               multiline: true,
               action_id: "action",
               placeholder: {
                  type: "plain_text",
                  text: "Please provide the reason for your absence",
               },
            },
            label: {
               type: "plain_text",
               text: "Reason",
            },
         });
         modal.blocks.push(popped);
      }
      modal.blocks.push({
         type: "context",
         elements: [
            {
               type: "mrkdwn",
               text: "*Schedule entry has now been deleted. You can exit the menu.*",
            }
         ]
      });
      //Modify and save metadata
      metadata.deleted = true;
      modal.private_metadata = JSON.stringify(metadata);
      return modal;
   })

/**Evaluates and formats input data depending on the time basis */
const evaluateInput = {
   /**Evaluates and formats input data for the day time basis */
   day: ({ body }) => {
      //Gets input data
      var data = {
         periods: { absent: [], recieve_notebook: [], extended: {} },
         days: { absent: [], recieve_notebook: [] }
      };
      var day = clockFormatter.createDate(body.view.state.values.datepicker.action.selected_date, true);
      var values = JSON.stringify(body.view.state.values.checkboxes.action.selected_options);
      if (values.indexOf('"value":"attending"') == -1) data.days.absent.push(day);
      if (values.indexOf('"value":"recieve_notebook"') !== -1) data.days.recieve_notebook.push(day);
      return data;
   },
   /**Evaluates and formats input data for the week time basis */
   week: ({ body }) => {
      var data = {
         periods: { absent: [], recieve_notebook: [], extended: {} },
         days: { absent: [], recieve_notebook: [] }
      };
      var pEnd = null, pStart = null;
      var index = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      var attendance = [null, null, null, null, null, null, null];
      var notebook = [null, null, null, null, null, null, null];
      var weekStart = new Date(body.view.state.values.chosen_week.action.selected_option.value.split(' - ')[0]);
   
      //Gets the absent weekdays chosen
      for (const i of body.view.state.values.chosen_attendence_weekdays.action.selected_options) {
         let date = new Date(`${weekStart}`);
         date.setDate(date.getDate() + index.indexOf(i.value));
         attendance[index.indexOf(i.value)] = date;
      }
      //Gets the recieving notebook weekdays chosen
      for (const j of body.view.state.values.chosen_notebook_weekdays.action.selected_options) {
         let date = new Date(`${weekStart}`);
         date.setDate(date.getDate() + index.indexOf(j.value));
         notebook[index.indexOf(j.value)] = date;
      }
   
      //Formats the absent weekdays
      for (let k = 0; k < attendance.length; k++) {
         if (attendance[k - 1] == null && attendance[k] !== null) pStart = attendance[k];
         if (attendance[k + 1] == null && attendance[k] !== null) pEnd = attendance[k];
   
         if (pStart == pEnd && pStart !== null && pEnd !== null) {
            data.days.absent.push(clockFormatter.createDate(attendance[k], true));
            pStart = pEnd = null;
         } else if (pEnd !== null) {
            data.periods.absent.push(`${clockFormatter.createDate(pStart, true)} - ${clockFormatter.createDate(pEnd, true)}`);
            pStart = pEnd = null;
         }
      }
      //Formats the recieving notebook weekdats
      for (let l = 0; l < notebook.length; l++) {
         if (notebook[l - 1] == null && notebook[l] !== null) pStart = notebook[l];
         if (notebook[l + 1] == null && notebook[l] !== null) pEnd = notebook[l];
   
         if (pStart == pEnd && pStart !== null && pEnd !== null) {
            data.days.recieve_notebook.push(clockFormatter.createDate(notebook[l], true));
            pStart = pEnd = null;
         } else if (pEnd !== null) {
            data.periods.recieve_notebook.push(`${clockFormatter.createDate(pStart, true)} - ${clockFormatter.createDate(pEnd, true)}`);
            pStart = pEnd = null;
         }
      }
      return data;
   },
   /**Evaluates and formats input data for the month time basis */
   month: ({ body }) => {
      var data = {
         periods: { absent: [], recieve_notebook: [], extended: {} },
         days: { absent: [], recieve_notebook: [] }
      };
   
      //Gets input data from modal
      if (body.view.state.values.checkboxes.action.selected_options.length == 0) {
         var pStart = new Date(body.view.state.values.month_picker.action.selected_option.value);
         var pEnd = new Date(body.view.state.values.month_picker.action.selected_option.value);
         pEnd.setMonth(pEnd.getMonth() + 1);
         pEnd.setDate(pEnd.getDate() - 1);
         let period = `${clockFormatter.createDate(pStart, true)} - ${clockFormatter.createDate(pEnd, true)}`
         data.periods.absent.push(period);
         data.periods.extended[period] = {
            reason: body.view.state.values.reason.action.value,
            approved: false,
            notified: false,
            changes: {
               hasChanged: false,
               notified: 0,
               log: [],
            },
         };
      }
      return data;
   },
   /**Evaluates and formats input data for the custom time basis */
   custom: ({ body }) => {
      var data = {
         periods: { absent: [], recieve_notebook: [], extended: {} },
         days: { absent: [], recieve_notebook: [] }
      };
   
      //Gets the start and end dates of the period/day and calculates how long it is
      var pStart = new Date(body.view.state.values.from_date.from_date_action.selected_date);
      var pEnd = new Date(body.view.state.values.to_date.to_date_action.selected_date);
      var dist = (Date.parse(pEnd) - Date.parse(pStart)) / 1000 / 60 / 60 / 24;
   
      //If the end date is before the start date, swap them so it makes sense
      if (dist < 0) {
         pStart = new Date(body.view.state.values.to_date.to_date_action.selected_date);
         pEnd = new Date(body.view.state.values.from_date.from_date_action.selected_date);
         dist = Math.abs(dist);
      }
   
      //Gets the checkboxes input
      let jsonStr = JSON.stringify(body.view.state.values.checkboxes.checkbox_action.selected_options);
      let checkboxes = [true, false];
      if (jsonStr.indexOf('"value":"attending"') == -1) checkboxes[0] = false;
      if (jsonStr.indexOf('"value":"recieve_notebook"') !== -1) checkboxes[1] = true;
   
      //If the user checks that they are not going to be at robotics; format the schedule data and check duration
      if (!checkboxes[0]) {
         //If the duration is only a day, add it to the day entries
         if (dist == 0) data.days.absent.push(clockFormatter.createDate(pStart, true));
         //If it's longer; format it and check
         else {
            //Formats into period form and puts it in period entries for schedule data
            let str = `${clockFormatter.createDate(pStart, true)} - ${clockFormatter.createDate(pEnd, true)}`;
            data.periods.absent.push(str);
            //If the duration of the period is longer than a specified amount. Store the given reason in the extended entries
            if (dist >= ConfigFile.reason_for_absence_threshold) {
               data.periods.extended[str] = {
                  reason: body.view.state.values.custom_reason.action.value,
                  approved: false,
                  notified: false,
                  changes: {
                     hasChanged: false,
                     notified: 0,
                     log: [],
                  },
               };
            }
         }
      }
      //If the user checked the second checkbox, saying they want to be notified of engineering notebook. Format and get the dates for that.
      if (checkboxes[1]) {
         if (dist == 0) data.days.recieve_notebook.push(clockFormatter.createDate(pStart, true));
         else {
            let str = `${clockFormatter.createDate(pStart, true)} - ${clockFormatter.createDate(pEnd, true)}`;
            data.periods.recieve_notebook.push(str);
         }
      }
      return data;
   }
}


/**Handles when the user chooses to go to the schedule configuration menu */
const updateToConfig = async ({ ack, client, body }) => {
   await ack();
   //Gets and uploads modal
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: await Assembly.getModal('config', { body }),
      view_id: body.view.id
   });
}

//Reason Handling
/**Handles general interaction actions on custom schedule making. Used to see if they need to provide a reason for their absence. */
const customActionDateEvent = async ({ ack, client, body }) => {
   await ack();
   //Gets current input data and calculates period duration
   var metadata = JSON.parse(body.view.private_metadata);
   var startDate = new Date(body.view.state.values.from_date.from_date_action.selected_date);
   var endDate = new Date(body.view.state.values.to_date.to_date_action.selected_date);
   var dist = (Date.parse(endDate) - Date.parse(startDate)) / 1000 / 60 / 60 / 24;
   var attendanceUnchecked = JSON.stringify(body.view.state.values).indexOf('"value":"attending"') == -1;

   //If the end date is before the start date, swap them so it makes sense
   if (dist < 0) {
      startDate = new Date(body.view.state.values.to_date.to_date_action.selected_date);
      endDate = new Date(body.view.state.values.from_date.from_date_action.selected_date);
      dist = Math.abs(dist);
   }

   //If the period duration is longer than a specified amount; add a reason field to the modal.
   if (dist >= ConfigFile.reason_for_absence_threshold && attendanceUnchecked && !metadata.reasonAdded) {
      //If one of the dates is not filled in, meaning the modal is incomplete; return.
      if (body.view.state.values.to_date.to_date_action.selected_date == null) return;
      if (body.view.state.values.from_date.from_date_action.selected_date == null) return;
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('custom_reason_input'),
         view_id: body.view.id
      });
   }
   //If the period duration is not over the threshold, or the person is still attending robotics. And a reason has been added to the modal; delete the reason field.
   if ((dist < ConfigFile.reason_for_absence_threshold || !attendanceUnchecked) && metadata.reasonAdded) {
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('custom'),
         view_id: body.view.id
      });
   }
}

/**Handles general interaction actions on config schedule changing. Used to see if they need to provide a reason for their absence. */
const configActionDateEvent = async ({ ack, client, body }) => {
   await ack();
   //Gets current input data and calculates period duration
   var metadata = JSON.parse(body.view.private_metadata);
   if (metadata.deleted) return;

   var startDate = new Date(body.view.state.values.from_date.config_from_date_action.selected_date);
   var endDate = new Date(body.view.state.values.to_date.config_to_date_action.selected_date);
   var dist = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 1000 / 60 / 60 / 24);
   var attendanceUnchecked = JSON.stringify(body.view.state.values).indexOf('"value":"attending"') == -1;

   //If the end date is before the start date, swap them so it makes sense
   if (dist < 0) {
      startDate = new Date(body.view.state.values.to_date.config_to_date_action.selected_date);
      endDate = new Date(body.view.state.values.from_date.config_from_date_action.selected_date);
      dist = Math.abs(dist);
   }

   //If the period duration is longer than a specified amount; add a reason field to the modal.
   if (dist >= ConfigFile.reason_for_absence_threshold && attendanceUnchecked && !metadata.reasonAdded) {
      //If one of the dates is not filled in, meaning the modal is incomplete; return.
      if (body.view.state.values.to_date.config_to_date_action.selected_date == null) return;
      if (body.view.state.values.from_date.config_from_date_action.selected_date == null) return;
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: await Assembly.getModal('config_period_reason_input', { body }),
         view_id: body.view.id
      });
   }
   //If the period duration is not over the threshold, or the person is still attending robotics. And a reason has been added to the modal; delete the reason field.
   if ((dist < ConfigFile.reason_for_absence_threshold || !attendanceUnchecked) && metadata.reasonAdded) {
      //Gets and uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: JSON.parse(JSON.stringify(ScheduleShortcut.modal.custom_config)),
         view_id: body.view.id
      });
   }
}

//Config Submission Events
/**Handles when the user submits a day config modal */
const configDaySubmitEvent = async ({ ack, client, body }) => {

   //Gets the metadata anc checks to see if the schedule entry has already been deleted
   const metadata = JSON.parse(body.view.private_metadata);
   if (metadata.deleted){
      await ack();
      return;
   }

   //Formats metadata date
   var date = metadata.date.date;
   var dateFormatted = new Date(removeOrdinalIndicator(date));
   dateFormatted = `${dateFormatted.getFullYear()}-${dateFormatted.getMonth()+1}-${dateFormatted.getDate()}`;

   //Formats input date
   var inputDate = body.view.state.values.datepicker.action.selected_date;
   var inputDateFormatted = inputDate.split('-').map(i => parseInt(i));
   inputDateFormatted = `${inputDateFormatted[0]}-${inputDateFormatted[1]}-${inputDateFormatted[2]}`;
   inputDate = clockFormatter.createDate(inputDate,true);

   var str = '';
   scheduleData = await scheduleFile.read();

   //If the user changed the desired date
   if (dateFormatted !== inputDateFormatted){
      //Check to see if new date overlaps with any existing
      const check = [
         checkDateOverlap({ date: clockFormatter.createDate(inputDateFormatted,true), type: 'day', location: 'absent', userId: body.user.id}),
         checkDateOverlap({ date: clockFormatter.createDate(inputDateFormatted,true), type: 'day', location: 'recieve_notebook', userId: body.user.id})
      ];
      
      //If there is overlap
      if (check[0].check || check[1].check){
         //Creates an error responce string
         let periods = mergeArrays(check[0].periods, check[1].periods);
         let days = mergeArrays(check[0].days, check[1].days);
         for (const m of periods) str += `'${m}', `;
         for (const n of days) str += `'${n}', `;
         str = ''.concat(str.slice(0, str.lastIndexOf(',')), str.slice(str.lastIndexOf(',') + 1, str.length));
         if (days.length + periods.length > 1) str = ''.concat(str.slice(0, str.lastIndexOf(',') + 1), ' and', str.slice(str.lastIndexOf(',') + 1, str.length));
         if (days.length + periods.length == 2) str = ''.concat(str.slice(0, str.lastIndexOf(',')), str.slice(str.lastIndexOf(',') + 1, str.length));
         if (days.length + periods.length == 1) str += ' is ';
         else str += ' are ';
         str += 'already scheduled. If you want to change the settings for this date, go back to the selection menu.';

         //Responds with an error saying that there is overlap
         await ack({
            response_action: 'errors',
            errors: {
               datepicker: str
            }
         });
         return;
      }
   }

   //Gets the checkbox input data
   var values = JSON.stringify(body.view.state.values.checkboxes.action.selected_options), index;
   //If the user set the checkboxes to their default value and a warning hasn't alread been sent
   if (values.indexOf('"value":"attending"') !== -1 && values.indexOf('"value":"recieve_notebook"') == -1 && !metadata.checkboxWarningSent){
      //Sends an error saying that there input will not have an effect
      await ack({
         response_action: 'errors',
         errors: {
            checkboxes: `Having attendance and not wanting an engineering log won't have an effect on your scheduling. The system will delete this entry because of this. If you want to continue press the save button again.`
         }
      });

      //Gets modal data and changes the metadata inside of it
      let modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.day_config));
      let metaOverwrite = JSON.parse(body.view.private_metadata);
      metaOverwrite.checkboxWarningSent = true;
      modal.blocks = body.view.blocks;
      modal.private_metadata = JSON.stringify(metaOverwrite);

      //Sends modal that contains metadata that the warning has been sent
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
      return;
   } else await ack();

   //If the original date was set to be absent
   if (metadata.date.absent){
      //Replace the original date with the new one
      index = scheduleData[body.user.id].days.absent.indexOf(date);
      scheduleData[body.user.id].days.absent[index] = inputDate;
      //If the input data changes the attendence, save it as such
      if (values.indexOf('"value":"attending"') !== -1){
         scheduleData[body.user.id].days.absent = [].concat(
            scheduleData[body.user.id].days.absent.slice(0,index),
            scheduleData[body.user.id].days.absent.slice(index+1,scheduleData[body.user.id].days.absent.length)
         )
      } 
   //If the input data changes the attendence, save it as such
   } else if (values.indexOf('"value":"attending"') == -1) scheduleData[body.user.id].days.absent.push(inputDate);
   
   //If the original date was set to send a notebook log
   if (metadata.date.recieve_notebook){
      //Replace the original date with the new one
      index = scheduleData[body.user.id].days.recieve_notebook.indexOf(date);
      scheduleData[body.user.id].days.recieve_notebook[index] = inputDate;
      //If the input data changes the notebook log, save it as such
      if (values.indexOf('"value":"recieve_notebook"') == -1){
         scheduleData[body.user.id].days.recieve_notebook = [].concat(
            scheduleData[body.user.id].days.recieve_notebook.slice(0,index),
            scheduleData[body.user.id].days.recieve_notebook.slice(index+1,scheduleData[body.user.id].days.recieve_notebook.length)
         )
      }
   //If the input data changes the notebook log, save it as such
   } else if (values.indexOf('"value":"recieve_notebook"') !== -1) scheduleData[body.user.id].days.recieve_notebook.push(inputDate);

   //Save schedule data in schedule file
   await scheduleFile.writePath(`${body.user.id}.days`,scheduleData[body.user.id].days);

   //Logs results
   userData = await userFile.read();
   str = `User '${userData[body.user.id].slack_name}' (${userData[body.user.id].name}) has updated schedule data for '${date}'`;
   if (dateFormatted !== inputDateFormatted) str += ` (now ${inputDate})`;
   await Highway.makeRequest('Local','log',[str]);
   console.log(terminalFormatter.bulletPoint,str);
}

/**Handles when the user submits a period config modal */
const configPeriodSubmitEvent = async ({ack, client, body }) => {

   //Gets the metadata anc checks to see if the schedule entry has already been deleted
   const metadata = JSON.parse(body.view.private_metadata);
   if (metadata.deleted){
      await ack();
      return;
   }

   //Formats metadata date
   var pStart = metadata.date.date.split(' - ')[0]
   var pEnd = metadata.date.date.split(' - ')[1];
   var pDatesFormatted = [new Date(removeOrdinalIndicator(pStart)),new Date(removeOrdinalIndicator(pEnd))];
   pDatesFormatted = [
      `${pDatesFormatted[0].getFullYear()}-${pDatesFormatted[0].getMonth()+1}-${pDatesFormatted[0].getDate()}`,
      `${pDatesFormatted[1].getFullYear()}-${pDatesFormatted[1].getMonth()+1}-${pDatesFormatted[1].getDate()}`
   ];

   //Formats input date
   var iStart = body.view.state.values.from_date.config_from_date_action.selected_date;
   var iEnd = body.view.state.values.to_date.config_to_date_action.selected_date;
   var iDatesFormatted = [iStart.split('-').map(i => parseInt(i)),iEnd.split('-').map(i => parseInt(i))];
   iDatesFormatted[0] = `${iDatesFormatted[0][0]}-${iDatesFormatted[0][1]}-${iDatesFormatted[0][2]}`;
   iDatesFormatted[1] = `${iDatesFormatted[1][0]}-${iDatesFormatted[1][1]}-${iDatesFormatted[1][2]}`;
   iStart = clockFormatter.createDate(iStart,true);
   iEnd = clockFormatter.createDate(iEnd,true);

   var str = '', extendedStore;
   scheduleData = await scheduleFile.read();
   const index = { 
      absent: scheduleData[body.user.id].periods.absent.indexOf(metadata.date.date),
      recieve_notebook: scheduleData[body.user.id].periods.recieve_notebook.indexOf(metadata.date.date)
   };

   //Removes all the data relating to this schedule entry (will be added back later)
   scheduleData[body.user.id].periods.absent = [].concat(
      scheduleData[body.user.id].periods.absent.slice(0,index.absent),
      scheduleData[body.user.id].periods.absent.slice(index.absent+1,scheduleData[body.user.id].periods.absent.length)
   );
   scheduleData[body.user.id].periods.recieve_notebook = [].concat(
      scheduleData[body.user.id].periods.recieve_notebook.slice(0,index.recieve_notebook),
      scheduleData[body.user.id].periods.recieve_notebook.slice(index.recieve_notebook+1,scheduleData[body.user.id].periods.recieve_notebook.length)
   );
   if (typeof scheduleData[body.user.id].periods.extended[`${pStart} - ${pEnd}`] !== 'undefined'){
      let extended = {};
      for (const i in scheduleData[body.user.id].periods.extended){
         if (i !== `${pStart} - ${pEnd}`) extended[i] = scheduleData[body.user.id].periods.extended[i];
         else extendedStore = JSON.parse(JSON.stringify(scheduleData[body.user.id].periods.extended[i]));
      }
      scheduleData[body.user.id].periods.extended = extended;
   }

   //If the user changed the desired date
   if (pDatesFormatted[0] !== iDatesFormatted[0] || pDatesFormatted[1] !== iDatesFormatted[1]){
      
      let period = `${iStart} - ${iEnd}`;
      //Check to see if new date overlaps with any existing
      const check = [
         checkDateOverlap({ date: period, type: 'period', location: 'absent', userId: body.user.id}),
         checkDateOverlap({ date: period, type: 'period', location: 'recieve_notebook', userId: body.user.id})
      ];

      //If there is overlap
      if (check[0].check || check[1].check){
         //Creates an error responce string
         let periods = mergeArrays(check[0].periods, check[1].periods);
         let days = mergeArrays(check[0].days, check[1].days);
         for (const m of periods) str += `'${m}', `;
         for (const n of days) str += `'${n}', `;
         str = ''.concat(str.slice(0, str.lastIndexOf(',')), str.slice(str.lastIndexOf(',') + 1, str.length));
         if (days.length + periods.length > 1) str = ''.concat(str.slice(0, str.lastIndexOf(',') + 1), ' and', str.slice(str.lastIndexOf(',') + 1, str.length));
         if (days.length + periods.length == 2) str = ''.concat(str.slice(0, str.lastIndexOf(',')), str.slice(str.lastIndexOf(',') + 1, str.length));
         if (days.length + periods.length == 1) str += ' is ';
         else str += ' are ';
         str += 'already scheduled. If you want to change the settings for this date, go back to the selection menu.';

         //Responds with an error saying that there is overlap
         await ack({
            response_action: 'errors',
            errors: {
               to_date: str
            }
         });
         return;
      }
   }

   //Gets the checkbox input data
   var values = JSON.stringify(body.view.state.values.checkboxes.config_checkbox_action.selected_options);
   //If the user set the checkboxes to their default value and a warning hasn't alread been sent
   if (values.indexOf('"value":"attending"') !== -1 && values.indexOf('"value":"recieve_notebook"') == -1 && !metadata.checkboxWarningSent){
      //Sends an error saying that there input will not have an effect
      await ack({
         response_action: 'errors',
         errors: {
            checkboxes: `Having attendance and not wanting an engineering log won't have an effect on your scheduling. The system will delete this entry because of this. If you want to continue press the save button again.`
         }
      });

      //Gets modal data and changes the metadata inside of it
      let modal = JSON.parse(JSON.stringify(ScheduleShortcut.modal.day_config));
      let metaOverwrite = JSON.parse(body.view.private_metadata);
      metaOverwrite.checkboxWarningSent = true;
      modal.blocks = body.view.blocks;
      modal.private_metadata = JSON.stringify(metaOverwrite);

      //Sends modal that contains metadata that the warning has been sent
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
      return;
   } else await ack();

   //Adding back the deleted day in updated form...
   //If the original date was set to be absent
   if (values.indexOf('"value":"attending"') == -1){
      scheduleData[body.user.id].periods.absent = [].concat(
         scheduleData[body.user.id].periods.absent.slice(0,index.absent),
         [`${iStart} - ${iEnd}`],
         scheduleData[body.user.id].periods.absent.slice(index.absent,scheduleData[body.user.id].periods.absent.length)
      );
   }
   //If the original date was set to send a notebook log
   if (values.indexOf('"value":"recieve_notebook"') !== -1){
      scheduleData[body.user.id].periods.recieve_notebook = [].concat(
         scheduleData[body.user.id].periods.recieve_notebook.slice(0,index.recieve_notebook),
         [`${iStart} - ${iEnd}`],
         scheduleData[body.user.id].periods.recieve_notebook.slice(index.recieve_notebook,scheduleData[body.user.id].periods.recieve_notebook.length)
      );
   }
   //If a reason was added, store the reason in extended and log the changes to the entry as well
   if (metadata.reasonAdded){
      extendedStore.changes.hasChanged = true;
      if (extendedStore.changes.log.length == 0) extendedStore.changes.log.push({
         date: `${pStart} - ${pEnd}`,
         reason: extendedStore.reason,
         absent: index.absent !== -1,
         recieve_notebook: index.recieve_notebook !== -1
      });
      extendedStore.reason = body.view.state.values.custom_reason.action.value;
      extendedStore.changes.log.push({
         date: `${iStart} - ${iEnd}`,
         reason: body.view.state.values.custom_reason.action.value,
         absent: values.indexOf('"value":"attending"') == -1,
         recieve_notebook: values.indexOf('"value":"recieve_notebook"') !== -1
      });
      scheduleData[body.user.id].periods.extended[`${iStart} - ${iEnd}`] = extendedStore;
   }

   //Save schedule data in schedule file
   await scheduleFile.writePath(`${body.user.id}.periods`,scheduleData[body.user.id].periods);

   //Logs results
   userData = await userFile.read();
   str = `User '${userData[body.user.id].slack_name}' (${userData[body.user.id].name}) has updated schedule data for '${pStart} - ${pEnd}'`;
   if (pDatesFormatted[0] !== iDatesFormatted[0] || pDatesFormatted[1] !== iDatesFormatted[1]) str += ` (now ${iStart} - ${iEnd})`;
   await Highway.makeRequest('Local','log',[str]);
   console.log(terminalFormatter.bulletPoint,str);
}

//Miscelleneous
/**
 * Check the schedule data of a user with a provided date to see if there is any overlap.
 * @param {Object} options Options for the check
 * @param {String | Date} options.date Date to check for in schedule data
 * @param {String} options.type What type the date is. Can be either 'period' or 'day'
 * @param {String} options.location Where to check the schedule data for overlap. Can be either 'absent', 'recieve_notebook' or 'both'
 * @param {String} options.userId The user id of the person to check schedule data for
 * @returns {Object} Object containing a summary of the check
 */
const checkDateOverlap = ({ date, type, location, userId }) => {
   //Gets and formats the user's schedule data. Making it easier to read.
   const userScheduleData = {
      periods: (
         location !== 'both' ?
            scheduleData[userId].periods[location] :
            mergeArrays(scheduleData[userId].periods.recieve_notebook, scheduleData[userId].periods.absent)
      ),
      days: (
         location !== 'both' ?
            scheduleData[userId].days[location] :
            mergeArrays(scheduleData[userId].days.recieve_notebook, scheduleData[userId].days.absent)
      )
   };

   //Defines the object that stores what is to be returned
   var ret = {
      check: false,
      periods: [],
      days: []
   };

   switch (type) {
      //If it's checking a period
      case 'period':
         let start = Date.parse(removeOrdinalIndicator(date.split(' - ')[0]));
         let end = Date.parse(removeOrdinalIndicator(date.split(' - ')[1]));

         //Compares specified period date with existing scheduled periods
         for (const i of userScheduleData.periods) {
            let pStart = Date.parse(removeOrdinalIndicator(i.split(' - ')[0]));
            let pEnd = Date.parse(removeOrdinalIndicator(i.split(' - ')[1]));

            if (start >= pStart && start <= pEnd) {
               ret.check = true;
               ret.periods.push(i);
            } else if (end >= pStart && end <= pEnd) {
               ret.check = true;
               ret.periods.push(i);
            } else if (start <= pStart && end >= pEnd) {
               ret.check = true;
               ret.periods.push(i);
            }
         }
         //Compares specified period date with existing scheduled days
         for (const j of userScheduleData.days) {
            let day = Date.parse(removeOrdinalIndicator(j));
            if (day >= start && day <= end) {
               ret.check = true;
               ret.days.push(j);
            }
         }
         break;
      //If it's checking a day
      case 'day':
         let day = Date.parse(removeOrdinalIndicator(date));

         //Compares specified day with existing scheduled periods
         for (const i of userScheduleData.periods) {
            let pStart = Date.parse(removeOrdinalIndicator(i.split(' - ')[0]));
            let pEnd = Date.parse(removeOrdinalIndicator(i.split(' - ')[1]));

            if (day >= pStart && day <= pEnd) {
               ret.check = true;
               ret.periods.push(i);
            }
         }
         //Comapres specified day with existing scheduled days
         for (const j of userScheduleData.days) {
            let day2 = Date.parse(removeOrdinalIndicator(j));

            if (day == day2) {
               ret.check = true;
               ret.days.push(j);
            }
         }
         break;
      default: throw new Error(`Expected value 'period' or 'day' for date type. Recieved '${type}'`);
   }
   return ret;
}

export default ScheduleShortcut;
