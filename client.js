const axios = require("axios");
const prompt = require("prompt");

const { HOST, PROJECT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;

const api = axios.create({
  baseURL: HOST,
  headers: {
    "x-PlanMill-Currency": "EUR",
  },
});

async function getAccessToken() {
  try {
    const { data } = await api.get("api/oauth2/token", {
      params: {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
      },
    });
    return data.access_token;
  } catch {
    console.error("Unable to get access key. Do you need to re-authorize?");
    process.exit(-1);
  }
  return null;
}

async function getHoursPerPerson(personId, accessToken) {
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const { data } = await api.get(`api/1.5/timereports`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      projectfilter: PROJECT_ID,
      person: personId,
      billableStatus: "4,5,6",
      intervalstart: startDate.toISOString(),
      rowcount: 2000,
    },
  });
  return data;
}

async function getProjectPerformers(accessToken) {
  const { data } = await api.get(`api/1.5/projects/${PROJECT_ID}/tasks/meta`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const performers = data.filters.find(
    (item) => item.name === "Assignment.PersonId"
  ).values;

  return Object.keys(performers)
    .map((performerId) => Number.parseInt(performerId))
    .filter((performerId) => performerId > 0);
}

async function getProjectTasks(accessToken) {
  const { data: tasks } = await api.get(
    `api/1.5/projects/${PROJECT_ID}/tasks`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return tasks.map((task) => ({
    name: task.name,
    id: task.id,
  }));
}

function getBillableAmount(timeReports) {
  return timeReports.reduce((result, item) => {
    const timeInHours = item.amount / 60;
    const billableAmount = timeInHours * item.unitPrice;
    return result + billableAmount;
  }, 0.0);
}

function getHoursAmount(timeReports) {
  return timeReports.reduce((result, item) => {
    const timeInHours = item.amount / 60;
    return result + timeInHours;
  }, 0.0);
}

function filterHourMarkingsByTask(timeReports, taskId) {
  return timeReports.filter((item) => {
    return item.task === taskId;
  });
}

function getTotalBudget(hourMarkings) {
  const billableAmounts = hourMarkings.map(getBillableAmount);
  return billableAmounts.reduce((result, item) => result + item);
}

function getTotalAmountOfHours(hourMarkings) {
  const hours = hourMarkings.map(getHoursAmount);
  return hours.reduce((result, item) => result + item);
}

async function getProjectData(taskId, accessToken) {
  try {
    const userIds = await getProjectPerformers(accessToken);

    const hourMarkings = await Promise.all(
      userIds.map((userId) => getHoursPerPerson(userId, accessToken))
    );
    const filteredHourMarkings = hourMarkings.map((marking) =>
      filterHourMarkingsByTask(marking, taskId)
    );

    const billableAmount = getTotalBudget(filteredHourMarkings);
    console.log(`Currently used budget: ${billableAmount} Euro`);

    const totalHours = getTotalAmountOfHours(filteredHourMarkings);
    console.log(`Currently used hours: ${totalHours} hours`);
    console.log(`Currently used hours: ${totalHours / 8} days`);
  } catch (e) {
    console.log(e);
  }
}

async function getTaskInfo() {
  const accessToken = await getAccessToken();

  const productInfo = await getProjectTasks(accessToken);
  productInfo.map((info, idx) => console.log(`${idx}: ${info.name}`));

  prompt.start();
  prompt.get(["taskIndex"], async function (err, result) {
    const task = productInfo[result.taskIndex];

    console.log("");
    console.log(`Data for "${task.name}":`);

    await getProjectData(task.id, accessToken);

    console.log("");
    prompt.stop();
  });
}

getTaskInfo();
