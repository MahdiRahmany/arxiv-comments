// Function to clean and extract arXiv ID from input
function cleanArxivId(input) {
    input = input.trim();

    // Case 1: If the input starts with "arXiv:", strip it
    if (input.toLowerCase().startsWith('arxiv:')) {
        input = input.slice(6).trim();
    }

    // Case 2: If it's a full URL like "https://arxiv.org/abs/2312.08472" or "https://arxiv.org/pdf/2312.08472"
    if (input.startsWith('https://arxiv.org/')) {
        // Extract the part after "abs/" or "pdf/"
        const parts = input.split('/');
        input = parts[parts.length - 1]; // Get the last part of the URL (the ID)
    }

    return input;
}

// Function to extract comments from LaTeX source
function extractComments(latexSource) {
    const lines = latexSource.split('\n');
    const comments = lines.filter(line => line.trim().startsWith('%'));
    return comments.join('\n');
}

// Function to display the comments for a LaTeX file
function displayTexFile(fileName, comments) {
    const container = document.getElementById('commentsContainer');

    const fileBox = document.createElement('div');
    fileBox.style.marginBottom = '20px';

    // Display the file name directly without "File: "
    const fileNameHeader = document.createElement('h3');
    fileNameHeader.innerText = fileName;

    const commentsBox = document.createElement('pre');
    commentsBox.innerText = comments || 'No comments found.';
    commentsBox.style.backgroundColor = '#f4f4f4';
    commentsBox.style.padding = '10px';
    commentsBox.style.border = '1px solid #ddd';

    fileBox.appendChild(fileNameHeader);
    fileBox.appendChild(commentsBox);
    container.appendChild(fileBox);
}


// Function to display the abstract and compressed source links
function addHeaderText(arxivId, arxivLink) {
    const extractedLinksContainer = document.getElementById('extractedLinks');
    extractedLinksContainer.innerHTML = ''; // Clear previous results

    // Create a paragraph to contain the icon and the text
    const paragraph = document.createElement('p');

    // Create a single line with both the abstract and compressed source links
    const infoText = document.createElement('span');

    const absLink = `<a href="https://arxiv.org/abs/${arxivId}" target="_blank">abs/${arxivId}</a>`;
    const sourceLink = `<a href="${arxivLink}" target="_blank">compressed&nbsp;source</a>`;

    // Add the Share icon (using assets/share.svg)
    const shareIcon = document.createElement('img');
    shareIcon.src = 'assets/share.svg';
    shareIcon.alt = 'Share';
    shareIcon.classList.add('share-icon');

    // Get the current URL
    const currentUrl = window.location.href;

    // Set the hover title to show "Copy the URL {current_url} to clipboard"
    shareIcon.title = `Copy the URL ${currentUrl} to clipboard`;

    // Dynamically adjust the share icon's size based on the font size of the "E"
    document.fonts.ready.then(() => {
        // Append the icon and text temporarily to calculate size
        paragraph.appendChild(shareIcon);
        paragraph.appendChild(infoText);

        // Measure the height of the "E" of the Extracted comments text
        const fontSize = window.getComputedStyle(infoText).fontSize;
        const textHeight = parseFloat(fontSize); // Get the height in pixels

        // Set the icon's height and width to match the text height
        shareIcon.style.height = `${textHeight}px`;
        shareIcon.style.width = `${textHeight}px`; // Keep aspect ratio
    });

    // Add click event to copy the URL
    shareIcon.addEventListener('click', () => {
        if (document.hasFocus()) { // Ensure the document is focused
            copyToClipboard(currentUrl);
        } else {
            alert('Please ensure the window is focused to copy the URL.');
        }
    });

    infoText.innerHTML = `Extracted comments from ${absLink} (${sourceLink}):`;

    extractedLinksContainer.appendChild(paragraph);
}


// Function to copy text to the clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('URL copied to clipboard!');
    }).catch(err => {
        console.error('Error copying text: ', err);
    });
}


// Function to parse .tar archive
function parseTar(tarData) {
    const files = {};
    let offset = 0;

    while (offset < tarData.length) {
        const header = tarData.slice(offset, offset + 512);

        // If the header is all zeros, we've reached the end of the archive
        if (header.every(byte => byte === 0)) {
            break;
        }

        const name = new TextDecoder().decode(tarData.slice(offset, offset + 100)).replace(/\0/g, '').trim();
        const sizeField = new TextDecoder().decode(tarData.slice(offset + 124, offset + 136)).replace(/\0/g, '').trim();

        // Parse size as an octal number
        const size = parseInt(sizeField, 8);

        if (name && size > 0) {
            const contentStart = offset + 512;
            const contentEnd = contentStart + size;
            files[name] = tarData.slice(contentStart, contentEnd);
            offset = contentEnd + (512 - (size % 512 || 512)); // Move to the next 512-byte block boundary
        } else {
            // If there's no valid file name or size, move to the next 512-byte block
            offset += 512;
        }
    }
    return files;
}

// Function to extract the original file name from GZIP header
function getOriginalGzipFileName(buffer) {
    const GZIP_FLG_FNAME = 0x08;
    let offset = 10; // GZIP header length before optional fields

    // Check the flags to see if the FNAME (original file name) field is present
    const flg = buffer[3];
    if (flg & GZIP_FLG_FNAME) {
        // The original filename starts right after the 10-byte header (or longer if extra fields are present)
        let fileName = '';
        while (buffer[offset] !== 0) {
            fileName += String.fromCharCode(buffer[offset]);
            offset++;
        }
        return fileName;
    }
    return null;
}
function showLoading(arxivId) {
    const container = document.getElementById('commentsContainer');

    // Set the loading message with spinner
    container.innerHTML = `
        Fetching article ${arxivId} and extracting comments...
        <div id="loadingSpinner"></div>
    `;

    // Clear previous extracted links
    const extractedLinksContainer = document.getElementById('extractedLinks');
    extractedLinksContainer.innerHTML = '';
}
// Fetch the file from the arXiv link
async function fetchPaper(arxivId) {
    const arxivLink = `https://arxiv.org/e-print/${arxivId}`;
    const fetchButton = document.getElementById('fetchComments');
    fetchButton.disabled = true;
    try {
        showLoading(arxivId);
        console.log(`Fetching paper: ${arxivLink}`);
        const response = await fetch(arxivLink);

        // Handle cases where the fetch response is not OK (e.g., 404)
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`Error: The arXiv paper with ID "${arxivId}" could not be found (404).`);
            } else if (response.status === 403) {
                throw new Error(`Error: Access to arXiv paper with ID "${arxivId}" is forbidden (403).`);
            } else {
                throw new Error(`Error fetching the paper: ${response.statusText} (${response.status}).`);
            }
        }

        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('Content-Type');

        console.log(`Content-Type: ${contentType}`);

        // Clear the commentsContainer before processing all .tex files
        const container = document.getElementById('commentsContainer');
        container.innerHTML = ''; // Clear previous results

        // Add the abstract and source links in a single line
        addHeaderText(arxivId, arxivLink);

        // Check if the file is a PDF
        // TODO: handle more filetypes!
        if (contentType === 'application/pdf') {
            console.log('Detected PDF file');
            container.innerText = 'Error: The download is a PDF document. The LaTeX source is not available for this paper.';
            return;
        }

        if (contentType.includes('application/gzip')) {
            console.log('Detected gzipped file');
            const buffer = new Uint8Array(arrayBuffer);

            // Extract the original file name from GZIP header
            const originalFileName = getOriginalGzipFileName(buffer) || `${arxivId}.tex`;

            // Decompress GZIP to get the raw content
            const decompressed = fflate.gunzipSync(buffer);

            // Check if decompressed data is a .tar file (indicated by the "ustar" format in its header)
            const isTarFile = new TextDecoder().decode(decompressed.slice(257, 262)) === 'ustar';

            if (isTarFile) {
                console.log('Detected tar archive inside gzip');
                const tarData = parseTar(decompressed);

                // Iterate through the .tar files and display each .tex file
                for (let fileName in tarData) {
                    if (fileName.endsWith('.tex')) {
                        console.log(`Found .tex file: ${fileName}`);
                        const latexSource = new TextDecoder().decode(tarData[fileName]);
                        const comments = extractComments(latexSource);
                        displayTexFile(fileName, comments);
                    }
                }
            } else {
                // Handle a direct LaTeX file (.tex)
                console.log('Detected plain LaTeX file inside gzip');
                const latexSource = new TextDecoder().decode(decompressed);
                const comments = extractComments(latexSource);
                displayTexFile(originalFileName, comments);
            }
        } else if (contentType.includes('application/zip')) {
            console.log('Detected zip file');
            const zipData = fflate.unzipSync(new Uint8Array(arrayBuffer));

            // Iterate through the .zip files and display each .tex file
            for (let fileName in zipData) {
                if (fileName.endsWith('.tex')) {
                    console.log(`Found .tex file: ${fileName}`);
                    const latexSource = new TextDecoder().decode(zipData[fileName]);
                    const comments = extractComments(latexSource);
                    displayTexFile(fileName, comments);
                }
            }
        } else {
            console.log('Detected plain .tex file');
            const text = new TextDecoder().decode(arrayBuffer);
            displayTexFile('Main LaTeX File', extractComments(text));
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);

        // Clear the extracted links container in case of an error
        document.getElementById('extractedLinks').innerHTML = '';

        const errorMessage = (error.message.includes("Failed to fetch"))
            ? `Error: Failed to fetch. This may be due to a CORS issue or an invalid arXiv ID ("${arxivId}").`
            : error.message;

        document.getElementById('commentsContainer').innerText = errorMessage;
    } finally {
        fetchButton.disabled = false;
    }
}

// Get query parameter value by key
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Event listener for the "Get Comments" button
document.getElementById('fetchComments').addEventListener('click', () => {
    let input = document.getElementById('arxivLink').value.trim();

    const arxivId = cleanArxivId(input);
    console.log(`Clean arxiv id: ${arxivId}`);

    const newUrl = `${window.location.pathname}?id=${arxivId}`;
    history.pushState(null, '', newUrl);

    fetchPaper(arxivId);
});

// Trigger button click on "Enter" keypress
document.getElementById('arxivLink').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('fetchComments').click();
    }
});

// Load the paper if a paper ID is in the query parameter
window.onload = function () {
    const rawArxivId = getQueryParam('id');
    if (rawArxivId) {
        document.getElementById('arxivLink').value = rawArxivId;
        const arxivId = cleanArxivId(rawArxivId);
        console.log(`Clean arxiv id from URL: ${arxivId}`);

        const newUrl = `${window.location.pathname}?id=${arxivId}`;
        history.replaceState(null, '', newUrl);

        fetchPaper(arxivId);
    }
};
// Load the JSON file and store the data
let monthlySubmissions = {};

// Fetch the JSON file with monthly submissions
fetch('assets/monthly_submissions.json')
    .then(response => response.json())
    .then(data => {
        monthlySubmissions = data;
    })
    .catch(error => {
        console.error('Error loading monthly submissions:', error);
    });

// Add "I'm Feeling Lucky" functionality
document.getElementById('feelingLucky').addEventListener('click', () => {
    const luckyId = generateRandomArxivId();
    document.getElementById('arxivLink').value = luckyId;

    // Trigger the comments fetch
    document.getElementById('fetchComments').click();
});

// Function to generate a random arXiv ID, ensuring uniform probability
function generateRandomArxivId() {
    // Step 1: Calculate the total number of submissions
    let totalSubmissions = 0;
    const cumulativeSubmissions = [];

    for (let yymm in monthlySubmissions) {
        totalSubmissions += monthlySubmissions[yymm];
        cumulativeSubmissions.push({ yymm: yymm, total: totalSubmissions });
    }

    // Step 2: Pick a random submission index (uniformly across all submissions)
    const randomSubmissionIndex = Math.floor(Math.random() * totalSubmissions) + 1;

    // Step 3: Find the corresponding month (yymm) and the submission number within that month
    let selectedYymm = '';
    let submissionNumber = 0;

    for (let i = 0; i < cumulativeSubmissions.length; i++) {
        if (randomSubmissionIndex <= cumulativeSubmissions[i].total) {
            selectedYymm = cumulativeSubmissions[i].yymm;
            const previousTotal = i > 0 ? cumulativeSubmissions[i - 1].total : 0;
            submissionNumber = randomSubmissionIndex - previousTotal;
            break;
        }
    }

    // Step 4: Format the arXiv ID
    let randomId;
    if (parseInt(selectedYymm) < 1501) {
        // Pre-2015 arXiv IDs are 4 digits
        randomId = `${selectedYymm}.${submissionNumber.toString().padStart(4, '0')}`;
    } else {
        // Post-2015 arXiv IDs have a 5-digit identifier after the period
        randomId = `${selectedYymm}.${submissionNumber.toString().padStart(5, '0')}`;
    }

    return randomId;
}