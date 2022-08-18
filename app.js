/* client side of the REST log system 

currently deals with simple log (in and out) tasks with tracking the project and ckecking the hours spent on the project

doesnt handle possible issues:
- duplicate records
- someone working overnight
- someone working in different timezone
- complex cases like employee has loged in by workstation and then went to a business trip till the end of the day so is supposed to log out by submitting a CSV file, but no CSV file was submitted, next morning employee comes and uses the workstation again and the workstation only submits date and time
*/

const express = require('express');
const app = express();
const multer = require('multer');
const upload = multer();

/* all interaction with the db */
const appDao = require('./dao');

/* current values are for test purposes only */
const dbFilePath = `./timeTracker.db`;
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(`/loadFile`, express.text());

app.get(`/`, (req, res) => {
  res.sendFile(__dirname + `/index.html`);
});

/* deals with tasks 2.1 and 2.3 
log with auto determining "in" or "out" and project
Is supposed to be used for automatic log - first get info about previous status and project of the user from the db and then make new record with this user, current time, same project and logout status if vrevious was login and vice versa. */
app.post(`/log`, async (req, res) => {
  let currentTime = new Date(),
    empId = req.body.id;
  logDb.getInfoAndLog(empId, currentTime).then(
    (logResult) => {
      res.status(200).send(logResult);
    },
    (err) => {
      res.status(400).send(err.message);
    }
  );
});

/* deals with tasks 2.1 and 2.3 
login
can be used to create new user entry or change the project of the current user (at the moment doesnt checks for situations user logged in for one project and then for another without logging out from the first one. */
app.post(`/login`, (req, res) => {
  let currentTime = new Date(),
    empId = req.body.id,
    logState = 1,
    projectId = req.body.projectID;
  logDb.logData([empId, currentTime, logState, projectId]).then(
    (employeeData) => res.status(200).send(employeeData),
    (err) => res.status(400).send(err.message)
  );
});

/* deals with tasks 2.1 and 2.3 
logout
Potentially is supposed to help with the issue mentioned in the previous comment - to log out from one project first before logging in to another one. */
app.post(`/logout`, (req, res) => {
  let currentTime = new Date(),
    empId = req.body.id,
    logState = 0,
    projectId = req.body.projectID;
  logDb.logData([empId, currentTime, logState, projectId]).then(
    (employeeData) => res.status(200).send(employeeData),
    (err) => res.status(400).send(err.message)
  );
});

/* deals with task 2.2
Loads small csv files of the predefined structure. It is not expected that single employee can generate too large log file. 
currently data validity are not checked in detail*/
app.post(`/loadFile`, upload.single(`uploaded_file`), (req, res) => {
  let logData = Buffer.from(req.file.buffer)
    .toString(`utf-8`)
    .replace(/\r/g, ``)
    .split(`\n`);
  logDb.loadCSVFile(logData).then(
    (fileLoadResult) => res.status(200).send(fileLoadResult),
    (err) => res.status(400).send(err.message)
  );
});

/* deals with task 2.4 
Returns time in hours rounded to one decimal pace (8 h 30 min will be represented as 8.5h) spent by all users on a selected project on a given date. By now doesn't handle people working overnight and in different timezones. */
app.get(`/project/:projectId`, async (req, res) => {
  await logDb.getProject(req.params.projectId).then(
    (projectTime) => {
      res.status(200).send(projectTime);
    },
    (err) => res.status(400).send(err.message)
  );
});

/*deals with task 2.5 
Determines when the highest number of employees were working on a given project at selected day. By now doesn't handle people working overnight and in different timezones. 
day should be given in form YYYY-MM-DD */
app.get(`/date/:day/project/:projectId`, async (req, res) => {
  //
  await logDb.getTime(req.params.day, req.params.projectId).then(
    (timeMax) => res.status(200).send(timeMax),
    (err) => res.status(400).send(err.message)
  );
});

/* not requested
for test
Returns all records for selected user. */
app.get(`/allEmployeeRecords/:id`, async (req, res) => {
  await logDb.checkAll(req.params.id).then(
    (employeeData) => res.status(200).send(employeeData),
    (err) => res.status(400).send(err.message)
  );
});

/* Added to keep REST api consistant. */
app.delete(
  '/deleteRecord/employeeId/:employeeId/datetime/:datetime',
  async (req, res) => {
    await logDb.deleteDbEntry(req.params.employeeId, req.params.datetime).then(
      (deleteResult) => {
        res.status(200).send(deleteResult);
      },
      (err) => res.status(400).send(err.message)
    );
  }
);

app.use(function (req, res) {
  res.status(404).send('no such page');
});

/*for test purpose */
let logDb = new appDao(dbFilePath);
logDb.initializeDb();

app.listen(port, () => {});
