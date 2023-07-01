import Shortcut from "../Shortcut.mjs";
import ConfigFile from "../../../ConfigFile.mjs";
import Highway from "../../../Highway.mjs";
import RegisterAlert from "./RegisterAlert.mjs";
import env from 'dotenv';
import { clockFormatter, removeOrdinalIndicator, mergeArrays, terminalFormatter } from "../../../helper.mjs";

env.config({ path: './security/.env'});

var scheduleFile, scheduleData, userFile, userData;

/**Scheduling shortcut handler */
const ScheduleShortcut = new Shortcut('schedule')
   //When shortcut is initialized, get schedule and user data
   .onReady(async () => {
      //Get user data
      userFile = await Highway.makeRequest('Local','getFile',['./data/users.json']);
      userData = await userFile.read();
      //Get schedule data
      scheduleFile = await Highway.makeRequest('Local','getFile',['./data/scheduling.json']);
      scheduleData = await scheduleFile.read();
   })
   //Opens the initial modal when shortcut is activated
   .onActivation(async ({ shortcut, ack, client }) => {
      await ack();
      
      //If the user is not registered; send them to registration
      if (!await RegisterAlert.check(shortcut.user.id)){
         await RegisterAlert.alert({ shortcut, ack, client });
         return;
      }

      //Gets the modal data and sends it
      const modal = ScheduleShortcut.modal.initial;
      await client.views.open({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         trigger_id: shortcut.trigger_id
      });
   })
   //When the shortcut is submitted; check for any overlap and store the schedule data
   .onSubmit(async (pkg) => {
      var data = null, { body, ack } = pkg;
      //Gets the schedule data from the submitted modal
      const scheduleType = JSON.parse(body.view.private_metadata).scheduleType;
      switch (scheduleType){
         case 'day':
            data = daySubmitEvaluate(pkg);
            break;
         case 'week':
            data = weekSubmitEvaluate(pkg);
            break;
         case 'month':
            data = monthSubmitEvaluate(pkg);
            break;
         case 'custom':
            data = customSubmitEvaluate(pkg);
            break;
      }

      //Processes schedule data and checks for any overlaps
      var readData = JSON.parse(JSON.stringify(scheduleData[body.user.id]));
      var checkCompile = { check: false, periods: [], days: [] };
      //Checks for overlap in absent periods
      for (const i of data.periods.absent){
         let scan = checkDateOverlap({ date: i, type: 'period', location: 'both', userId: body.user.id});
         if (scan.check){
            checkCompile.check = true;
            for (const ia of scan.periods) if (checkCompile.periods.indexOf(ia) == -1) checkCompile.periods.push(ia);
            for (const ib of scan.days) if (checkCompile.days.indexOf(ib) == -1) checkCompile.days.push(ib);
         } else readData.periods.absent.push(i);
      }
      //Checks for overlap in recieving notebook periods
      for (const j of data.periods.recieve_notebook){
         let scan = checkDateOverlap({ date: j, type: 'period', location: 'both', userId: body.user.id});
         if (scan.check){
            checkCompile.check = true;
            for (const ja of scan.periods) if (checkCompile.periods.indexOf(ja) == -1) checkCompile.periods.push(ja);
            for (const jb of scan.days) if (checkCompile.days.indexOf(jb) == -1) checkCompile.days.push(jb);
         } else readData.periods.recieve_notebook.push(j);
      }
      //Checks for overlap in absent days
      for (const k of data.days.absent){
         let scan = checkDateOverlap({ date: k, type: 'day', location: 'both', userId: body.user.id});
         if (scan.check){
            checkCompile.check = true;
            for (const ka of scan.periods) if (checkCompile.periods.indexOf(ka) == -1) checkCompile.periods.push(ka);
            for (const kb of scan.days) if (checkCompile.days.indexOf(kb) == -1) checkCompile.days.push(kb);
         } else readData.days.absent.push(k);
      }
      //Checks for overlap in recieving notebook days
      for (const l of data.days.recieve_notebook){
         let scan = checkDateOverlap({ date: l, type: 'day', location: 'both', userId: body.user.id});
         if (scan.check){
            checkCompile.check = true;
            for (const la of scan.periods) if (checkCompile.periods.indexOf(la) == -1) checkCompile.periods.push(la);
            for (const lb of scan.days) if (checkCompile.days.indexOf(lb) == -1) checkCompile.days.push(lb);
         } else readData.days.recieve_notebook.push(l);
      }
      //Overwrites the extended data for the time periods
      Object.assign(readData.periods.extended,data.periods.extended);

      var str = '';
      //If there is overlap; send them an error
      if (checkCompile.check){
         //Assembles the error string. It describes what days/periods are overlapping
         let errors = {};
         for (const m of checkCompile.periods) str += `'${m}', `;
         for (const n of checkCompile.days) str += `'${n}', `;
         str = ''.concat(str.slice(0,str.lastIndexOf(',')),str.slice(str.lastIndexOf(',') + 1,str.length));
         if (checkCompile.days.length + checkCompile.periods.length > 1) str = ''.concat(str.slice(0,str.lastIndexOf(',') + 1),' and',str.slice(str.lastIndexOf(',') + 1,str.length));
         if (checkCompile.days.length + checkCompile.periods.length == 2) str = ''.concat(str.slice(0,str.lastIndexOf(',')),str.slice(str.lastIndexOf(',') + 1,str.length));
         if (checkCompile.days.length + checkCompile.periods.length == 1) str += ' is ';
         else str += ' are ';
         str += 'already scheduled. If you want to change your scheduling, execute the scheduling shortcut again.';

         //Depending on the submitted schedule type, send the error to specific input blocks
         switch (scheduleType){
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
         let periods = mergeArrays(data.periods.absent,data.periods.recieve_notebook);
         let days = mergeArrays(data.days.absent,data.days.recieve_notebook);
         for (const m of periods) str += `'${m}', `;
         for (const n of days) str += `'${n}', `;
         str = ''.concat(str.slice(0,str.lastIndexOf(',')),str.slice(str.lastIndexOf(',') + 1,str.length));
         if (days.length + periods.length > 1) str = ''.concat(str.slice(0,str.lastIndexOf(',') + 1),' and',str.slice(str.lastIndexOf(',') + 1,str.length));
         if (days.length + periods.length == 2) str = ''.concat(str.slice(0,str.lastIndexOf(',')),str.slice(str.lastIndexOf(',') + 1,str.length));

         //Acknowledges the submission and stores the data in the local file.
         await ack();
         await scheduleFile.writePath(body.user.id,readData);
         scheduleData = await scheduleFile.read();

         //Logs the scheduling action
         str = `User '${userData[body.user.id].slack_name}' (${userData[body.user.id].name}) has scheduled for ${str}`;
         await Highway.makeRequest('Local','log',[str]);
         console.log(terminalFormatter.bulletPoint,str);
      }
   })
   //When someone interacts with the period choice button; routes to correct handler
   .onAction('period_choose',async ({ ack, client, body }) => {
      await ack();
      //Updates the modal depending on what they chose
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
   //Handles checking the time length to see if they need to provied a reason for their absence
   .onAction('from_date_action', async (pkg) => customActionDateHandler(pkg))
   .onAction('to_date_action', async (pkg) => customActionDateHandler(pkg))
   .onAction('checkbox_action', async (pkg) => customActionDateHandler(pkg))
   .onAction('action',async ({ ack }) => ack());

/**Handles when the user switches to changing specific days */
const updateToDay = async ({ client, body }) => {
   const modal = ScheduleShortcut.modal.day;

   //Upload modal
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      view_id: body.view.id
   });
}

/**Gets the input data from a day schedule submission and formats it */
const daySubmitEvaluate = ({ ack, body, client }) => {
   //Gets input data
   var data = {
      periods: {absent: [],recieve_notebook: [], extended: {}},
      days: {absent: [], recieve_notebook: []}
   };
   var day = clockFormatter.createDate(body.view.state.values.datepicker.action.selected_date,true);
   var values = JSON.stringify(body.view.state.values.checkboxes.action.selected_options);

   if (values.indexOf('"value":"attending"') == -1) data.days.absent.push(day);
   if (values.indexOf('"value":"recieve_notebook"') !== -1) data.days.recieve_notebook.push(day);

   return data;
}

/**Handles when the user switched to changing specific weeks (changes according to season) */
const updateToWeek = async ({ client, body }) => {
   const modal = ScheduleShortcut.modal.week;

   //Generate the week choices that the user can choose (base on season end and start dates)
   modal.blocks[5].accessory.options = [];
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

   //Uploads modal
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      view_id: body.view.id
   });
}

/**Gets the input data from a week schedule submission and formats it */
const weekSubmitEvaluate = ({ ack, body, client }) => {
   var data = {
      periods: {absent: [],recieve_notebook: [], extended: {}},
      days: {absent: [], recieve_notebook: []}
   };
   var pEnd = null, pStart = null;
   var index = ['mon','tue','wed','thu','fri','sat','sun'];
   var attendance = [null,null,null,null,null,null,null];
   var notebook = [null,null,null,null,null,null,null];
   var weekStart = new Date(body.view.state.values.chosen_week.action.selected_option.value.split(' - ')[0]);

   //Gets the absent weekdays chosen
   for (const i of body.view.state.values.chosen_attendence_weekdays.action.selected_options){
      let date = new Date(`${weekStart}`);
      date.setDate(date.getDate() + index.indexOf(i.value));
      attendance[index.indexOf(i.value)] = date;
   }
   //Gets the recieving notebook weekdays chosen
   for (const j of body.view.state.values.chosen_notebook_weekdays.action.selected_options){
      let date = new Date(`${weekStart}`);
      date.setDate(date.getDate() + index.indexOf(j.value));
      notebook[index.indexOf(j.value)] = date;
   }
   
   //Formats the absent weekdays
   for (let k = 0; k < attendance.length; k++){
      if (attendance[k - 1] == null && attendance[k] !== null) pStart = attendance[k];
      if (attendance[k + 1] == null && attendance[k] !== null) pEnd = attendance[k];

      if (pStart == pEnd && pStart !== null && pEnd !== null){
         data.days.absent.push(clockFormatter.createDate(attendance[k],true));
         pStart = pEnd = null;
      } else if (pEnd !== null){
         data.periods.absent.push(`${clockFormatter.createDate(pStart,true)} - ${clockFormatter.createDate(pEnd,true)}`);
         pStart = pEnd = null;
      }
   }
   //Formats the recieving notebook weekdats
   for (let l = 0; l < notebook.length; l++){
      if (notebook[l - 1] == null && notebook[l] !== null) pStart = notebook[l];
      if (notebook[l + 1] == null && notebook[l] !== null) pEnd = notebook[l];

      if (pStart == pEnd && pStart !== null && pEnd !== null){
         data.days.recieve_notebook.push(clockFormatter.createDate(notebook[l],true));
         pStart = pEnd = null;
      } else if (pEnd !== null){
         data.periods.recieve_notebook.push(`${clockFormatter.createDate(pStart,true)} - ${clockFormatter.createDate(pEnd,true)}`);
         pStart = pEnd = null;
      }
   }
   return data;
}

/**Handles when user switches to changing specific months (changes according to the season) */
const updateToMonth = async ({ client, body }) => {
   const modal = ScheduleShortcut.modal.month;
   
   //Generate the month choices that the user can choose (based on season end and start dates)
   modal.blocks[5].accessory.options = [];
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

   //Uploads modal
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      view_id: body.view.id
   });
}

/**Gets the input data from a month schedule submission and formats it */
const monthSubmitEvaluate = ({ ack, body, client }) => {
   var data = {
      periods: {absent: [],recieve_notebook: [], extended: {}},
      days: {absent: [], recieve_notebook: []}
   };

   //Gets input data from modal
   if (body.view.state.values.checkboxes.action.selected_options.length == 0){
      var pStart = new Date(body.view.state.values.month_picker.action.selected_option.value);
      var pEnd = new Date(body.view.state.values.month_picker.action.selected_option.value);
      pEnd.setMonth(pEnd.getMonth()+1);
      pEnd.setDate(pEnd.getDate()-1);
      let period = `${clockFormatter.createDate(pStart,true)} - ${clockFormatter.createDate(pEnd,true)}`
      data.periods.absent.push(period);
      data.periods.extended[period] = {
         reason: body.view.state.values.reason.action.value,
         approved: false,
         notified: false
      };
   }
   return data;
}

/**Handles when the user switches to making custom arrangments */
const updateToCustom = async ({ client, body }) => {
   const modal = ScheduleShortcut.modal.custom;

   //Uploads modal
   await client.views.update({
      token: process.env.SLACK_BOT_TOKEN,
      view: modal,
      view_id: body.view.id
   });
}

/**Gets the input data from a custom schedule submission and format it */
const customSubmitEvaluate = ({ ack, body, client }) => {
   var data = {
      periods: {absent: [],recieve_notebook: [], extended: {}},
      days: {absent: [], recieve_notebook: []}
   };

   //Gets the start and end dates of the period/day and calculates how long it is
   var pStart = new Date(body.view.state.values.from_date.from_date_action.selected_date);
   var pEnd = new Date(body.view.state.values.to_date.to_date_action.selected_date);
   var dist = (Date.parse(pEnd) - Date.parse(pStart)) / 1000 / 60 / 60 / 24;

   //If the end date is before the start date, swap them so it makes sense
   if (dist < 0){
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
   if (!checkboxes[0]){
      //If the duration is only a day, add it to the day entries
      if (dist == 0) data.days.absent.push(clockFormatter.createDate(pStart,true));
      //If it's longer; format it and check
      else {
         //Formats into period form and puts it in period entries for schedule data
         let str = `${clockFormatter.createDate(pStart,true)} - ${clockFormatter.createDate(pEnd,true)}`;
         data.periods.absent.push(str);
         //If the duration of the period is longer than a specified amount. Store the given reason in the extended entries
         if (dist >= ConfigFile.reason_for_absence_threshold){
            data.periods.extended[str] = {
               reason: body.view.state.values.custom_reason.action.value,
               approved: false,
               notified: false
            };
         }
      }
   }
   //If the user checked the second checkbox, saying they want to be notified of engineering notebook. Format and get the dates for that.
   if (checkboxes[1]){
      if (dist == 0) data.days.recieve_notebook.push(clockFormatter.createDate(pStart,true));
      else {
         let str = `${clockFormatter.createDate(pStart,true)} - ${clockFormatter.createDate(pEnd,true)}`;
         data.periods.recieve_notebook.push(str);
      }
   }
   return data;
}

/**Handles general interaction actions on custom schedule making. Used to see if they need to provide a reason for their absence. */
const customActionDateHandler = async ({ ack, client, body }) => {
   await ack();
   //Gets current input data and calculates period duration
   var metadata = JSON.parse(body.view.private_metadata);
   var startDate = new Date(body.view.state.values.from_date.from_date_action.selected_date);
   var endDate = new Date(body.view.state.values.to_date.to_date_action.selected_date);
   var dist = (Date.parse(endDate) - Date.parse(startDate)) / 1000 / 60 / 60 / 24;
   var modal = ScheduleShortcut.modal.custom;
   var attendanceUnchecked = JSON.stringify(body.view.state.values).indexOf('"value":"attending"') == -1;

   //If the end date is before the start date, swap them so it makes sense
   if (dist < 0){
      startDate = new Date(body.view.state.values.to_date.to_date_action.selected_date);
      endDate = new Date(body.view.state.values.from_date.from_date_action.selected_date);
      dist = Math.abs(dist);
   }

   //If the period duration is longer than a specified amount; add a reason field to the modal.
   if (dist >= ConfigFile.reason_for_absence_threshold && attendanceUnchecked && !metadata.reasonAdded){
      //If one of the dates is not filled in, meaning the modal is incomplete; return.
      if (body.view.state.values.to_date.to_date_action.selected_date == null) return;
      if (body.view.state.values.from_date.from_date_action.selected_date == null) return;
      //Add the reason field to the modal
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
      //Change metadata to match modal changes
      metadata.reasonAdded = true;
      modal.private_metadata = JSON.stringify(metadata);
      //Upload modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   }
   //If the period duration is not over the threshold, or the person is still attending robotics. And a reason has been added to the modal; delete the reason field.
   if ((dist < ConfigFile.reason_for_absence_threshold || !attendanceUnchecked) && metadata.reasonAdded){
      //Delets reason field
      modal.blocks.pop();

      //Changes metadata accordingly
      metadata.reasonAdded = false;
      modal.private_metadata = JSON.stringify(metadata);

      //Uploads modal
      await client.views.update({
         token: process.env.SLACK_BOT_TOKEN,
         view: modal,
         view_id: body.view.id
      });
   }
}

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
         mergeArrays(scheduleData[userId].periods.recieve_notebook,scheduleData[userId].periods.absent)
      ),
      days: (
         location !== 'both' ?
         scheduleData[userId].days[location] : 
         mergeArrays(scheduleData[userId].days.recieve_notebook,scheduleData[userId].days.absent)
      )
   };

   //Defines the object that stores what is to be returned
   var ret = {
      check: false,
      periods: [],
      days: []
   };

   switch (type){
      //If it's checking a period
      case 'period':
         let start = Date.parse(removeOrdinalIndicator(date.split(' - ')[0]));
         let end = Date.parse(removeOrdinalIndicator(date.split(' - ')[1]));

         //Compares specified period date with existing scheduled periods
         for (const i of userScheduleData.periods){
            let pStart = Date.parse(removeOrdinalIndicator(i.split(' - ')[0]));
            let pEnd = Date.parse(removeOrdinalIndicator(i.split(' - ')[1]));

            if (start >= pStart && start <= pEnd){
               ret.check = true;
               ret.periods.push(i);
            } else if (end >= pStart && end <= pEnd){
               ret.check = true;
               ret.periods.push(i);
            } else if (start <= pStart && end >= pEnd){
               ret.check = true;
               ret.periods.push(i);
            }
         }
         //Compares specified period date with existing scheduled days
         for (const j of userScheduleData.days){
            let day = Date.parse(removeOrdinalIndicator(j));
            if (day >= start && day <= end){
               ret.check = true;
               ret.days.push(j);
            }
         }
         break;
      //If it's checking a day
      case 'day':
         let day = Date.parse(removeOrdinalIndicator(date));

         //Compares specified day with existing scheduled periods
         for (const i of userScheduleData.periods){
            let pStart = Date.parse(removeOrdinalIndicator(i.split(' - ')[0]));
            let pEnd = Date.parse(removeOrdinalIndicator(i.split(' - ')[1]));

            if (day >= pStart && day <= pEnd){
               ret.check = true;
               ret.periods.push(i);
            }
         }
         //Comapres specified day with existing scheduled days
         for (const j of userScheduleData.days){
            let day2 = Date.parse(removeOrdinalIndicator(j));
            
            if (day == day2){
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

//todo - Change initial modal to match new schedule changing command
