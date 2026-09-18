//insert comma after 1000s in bid amounts
export function formatAmount(amount: number) {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

//capitalize first letter of string
export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

//format date to MM/DD/YYYY
export function formatDate(date: Date) {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

//format date to MM/DD/YYYY HH:MM AM/PM
export function formatDateTime(date: Date) {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
  return `${month}/${day}/${year} ${hours}:${minutesStr} ${ampm}`;
}

// Determine if the auction can be ended
export const canEndAuction = (timeLeft: string) => {
  if (timeLeft === "Ending...") {
    return true;
  } else {
    return false;
  }
};

// Is the time left less than 3 hours
export const isLessThan3Hours = (timeLeft: string) => {
  if (timeLeft === "Ending...") {
    return true;
  }

  const hoursMatch = timeLeft.match(/^(\d+)h/);
  const minutesMatch = timeLeft.match(/^(\d+)m/);
  const secondsMatch = timeLeft.match(/^(\d+)s/);

  // console.log("hoursMatch:", hoursMatch);
  // console.log("minutesMatch:", minutesMatch);
  // console.log("secondsMatch:", secondsMatch);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : undefined;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : undefined;
  const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : undefined;

  // const canEndAuction =
  //   hours !== undefined
  //     ? hours > 3
  //     : minutes !== undefined
  //     ? false
  //     : seconds !== undefined
  //     ? false
  //     : true;

  const canEndAuction =
    (hours !== undefined && hours < 3) ||
    (hours === undefined && minutes !== undefined) ||
    (hours === undefined && minutes === undefined && seconds !== undefined);
  return canEndAuction;
};

// Display time left in HH:MM:SS format
export const formatTimeLeft = (totalSeconds: number) => {
  if (totalSeconds <= 0) {
    return "Ending...";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hoursStr = hours > 0 ? `${hours}h ` : "";
  const minutesStr = minutes > 0 ? `${minutes}m ` : "";
  const secondsStr = `${seconds}s`;

  return `${hoursStr}${minutesStr}${secondsStr}`.trim();
};

// Format time left to display only weeks, days, or hours : minutes : seconds
export const formatTimeLeftShort = (milliSeconds: number) => {
  if (milliSeconds <= 0) {
    return "Ending...";
  }
  const totalSeconds = Math.floor(milliSeconds / 1000);
  const weeks = Math.floor(totalSeconds / (7 * 24 * 3600));
  const days = Math.floor((totalSeconds % (7 * 24 * 3600)) / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (weeks > 0) {
    return `${weeks}w`;
  } else if (days > 0) {
    return `${days}d`;
  } else {
    const hoursStr = hours > 0 ? `${hours}h : ` : "";
    const minutesStr = minutes > 0 ? `${minutes}m : ` : "";
    const secondsStr = `${seconds}s`;
    return `${hoursStr}${minutesStr}${secondsStr}`.trim();
  }
};
