const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configure the folder paths
const tempFolderPath = './temp';
const remoteFolderPath = 'schema/observability';
const localFolderPath = './dashboards-observability/server/adaptors/integrations/__data__/schema';

// Remove the existing temp folder if it exists
if (fs.existsSync(tempFolderPath)) {
    console.log('Removing existing temp folder...');
    execSync(`rm -rf ${tempFolderPath}`);
}

// Remove the existing local folder if it exists
if (fs.existsSync(localFolderPath)) {
    console.log('Removing existing local folder...');
    execSync(`rm -rf ${localFolderPath}`);
}

console.log('Cloning the remote repository to the temp folder...');
// Clone the remote repository to the temp folder
execSync(`git clone --depth 1 https://github.com/opensearch-project/opensearch-catalog ${tempFolderPath}`);

console.log('Copying files from temp folder to destination folder...');
// Copy files from the temp folder to the destination folder
copyFiles(path.join(tempFolderPath, remoteFolderPath), localFolderPath);

console.log('Removing the temp folder...');
// Remove the temp folder
execSync(`rm -rf ${tempFolderPath}`);

console.log('Files copied successfully.');

// Copy files recursively from the source folder to the destination folder
function copyFiles(sourceFolderPath, destinationFolderPath) {
    if (!fs.existsSync(destinationFolderPath)) {
        fs.mkdirSync(destinationFolderPath, { recursive: true });
    }

    const files = fs.readdirSync(sourceFolderPath);

    for (const file of files) {
        const sourceFilePath = path.join(sourceFolderPath, file);
        const destinationFilePath = path.join(destinationFolderPath, file);

        const stat = fs.statSync(sourceFilePath);

        if (stat.isFile() && file.endsWith('.mapping')) {
            console.log(`Copying file: ${sourceFilePath} to ${destinationFilePath}`);
            fs.copyFileSync(sourceFilePath, destinationFilePath);
        } else if (stat.isDirectory()) {
            const nestedDestinationFolderPath = path.join(destinationFolderPath, file);
            console.log(`Creating directory: ${nestedDestinationFolderPath}`);
            fs.mkdirSync(nestedDestinationFolderPath, { recursive: true });
            copyFiles(sourceFilePath, nestedDestinationFolderPath);
        }
    }
}
