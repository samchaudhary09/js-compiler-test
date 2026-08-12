async function example() {
  console.log("Starting...");

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log("Finished after 1 second.");
}

example();
