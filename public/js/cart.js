/* ===== GRANNY GEAR WORKSHOP - CART MANAGER JS ===== */

// State
let allJobs = [];
let filteredJobs = [];
let currentDetailJob = null;
let currentView = 'card';
let autoRefreshInterval = null;
let lastRefreshTime = null;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (!checkOperatorAuth()) {
        window.location.href = '/';
        return;
    }
    
    loadAllJobs();
    startAutoRefresh();
    initPWA();
});

// ===== AUTHENTICATION =====
function logoutOperator() {
    clearOperatorAuth();
    stopAutoRefresh();
}

// ===== AUTO-REFRESH (30 seconds) =====
function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
        silentRefresh();
    }, 30000);
    updateRefreshIndicator();
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

async function silentRefresh() {
    const indicator = document.getElementById('refreshIndicator');
    if (indicator) {
        indicator.textContent = 'Refreshing...';
    }
    
    try {
        // Get jobs via Apps Script
        const result = await apiCall('getJobs', {});
        
        if (result.success) {
            allJobs = result.jobs || [];
            renderKanbanBoard();
            if (currentView === 'list') {
                filterJobList();
            }
            updateStats();
            lastRefreshTime = new Date();
        }
    } catch (error) {
        console.error('Silent refresh error:', error);
    }
    
    updateRefreshIndicator();
}

function updateRefreshIndicator() {
    const indicator = document.getElementById('refreshIndicator');
    if (!indicator) return;
    
    if (!lastRefreshTime) {
        indicator.textContent = 'Updated just now';
        return;
    }
    
    const now = new Date();
    const diff = Math.floor((now - lastRefreshTime) / 1000);
    
    if (diff < 10) {
        indicator.textContent = 'Updated just now';
    } else if (diff < 60) {
        indicator.textContent = `Updated ${diff}s ago`;
    } else {
        indicator.textContent = `Updated ${Math.floor(diff / 60)}m ago`;
    }
}

// Update indicator every 10 seconds
setInterval(updateRefreshIndicator, 10000);

// ===== VIEW TOGGLE =====
function setView(view) {
    currentView = view;
    
    document.getElementById('viewCardBtn').classList.toggle('active', view === 'card');
    document.getElementById('viewListBtn').classList.toggle('active', view === 'list');
    
    document.getElementById('kanbanBoard').classList.toggle('hidden', view !== 'card');
    document.getElementById('listView').classList.toggle('active', view === 'list');
    
    if (view === 'list') {
        filterJobList();
    }
}

// ===== LOAD ALL JOBS =====
async function loadAllJobs() {
    showLoading(true);
    
    try {
        // Get jobs via Apps Script
        const result = await apiCall('getJobs', {});
        
        if (result.success) {
            allJobs = result.jobs || [];
            lastRefreshTime = new Date();
            renderKanbanBoard();
            if (currentView === 'list') {
                filterJobList();
            }
            updateStats();
            updateRefreshIndicator();
        } else {
            showToast('Error loading jobs: ' + result.error, 'error');
            allJobs = [];
            renderKanbanBoard();
        }
    } catch (error) {
        console.error('Load jobs error:', error);
        showToast('Connection error. Please try again.', 'error');
        allJobs = [];
        renderKanbanBoard();
    } finally {
        showLoading(false);
    }
}

// ===== RENDER KANBAN BOARD =====
function renderKanbanBoard() {
    const columns = {
        'pending': document.getElementById('columnPending'),
        'triaged': document.getElementById('columnTriaged'),
        'in-progress': document.getElementById('columnProgress'),
        'completed': document.getElementById('columnCompleted')
    };
    
    const counts = { 'pending': 0, 'triaged': 0, 'in-progress': 0, 'completed': 0 };
    
    Object.values(columns).forEach(col => col.innerHTML = '');
    
    const sortedJobs = [...allJobs].sort((a, b) => {
        const dateA = a.createdat ? new Date(a.createdat) : new Date(0);
        const dateB = b.createdat ? new Date(b.createdat) : new Date(0);
        return dateB - dateA;
    });
    
    sortedJobs.forEach((job) => {
        let status = (job.status || 'pending').toString().toLowerCase().trim();
        
        if (status === 'in progress' || status === 'inprogress') {
            status = 'in-progress';
        }
        
        const column = columns[status];
        
        if (column) {
            counts[status]++;
            column.appendChild(createJobCard(job));
        } else {
            counts['pending']++;
            columns['pending'].appendChild(createJobCard(job));
        }
    });
    
    document.getElementById('badgePending').textContent = counts['pending'];
    document.getElementById('badgeTriaged').textContent = counts['triaged'];
    document.getElementById('badgeProgress').textContent = counts['in-progress'];
    document.getElementById('badgeCompleted').textContent = counts['completed'];
    
    document.getElementById('archiveAction').style.display = counts['completed'] > 0 ? 'block' : 'none';
    
    Object.entries(columns).forEach(([status, column]) => {
        if (column.children.length === 0) {
            column.innerHTML = '<div class="empty">No jobs</div>';
        }
    });
}

function createJobCard(job) {
    const card = document.createElement('div');
    const urgency = (job.urgency || 'medium').toString().toLowerCase();
    const status = (job.status || 'pending').toString().toLowerCase();
    card.className = `job-card ${urgency}`;
    card.onclick = () => openJobDetail(job.jobid);
    
    const urgencyLabel = status === 'pending' ? 'New' : urgency.charAt(0).toUpperCase() + urgency.slice(1);
    const urgencyClass = status === 'pending' ? 'new' : urgency;
    
    const jobId = job.jobid || 'Unknown';
    const firstName = job.firstname || '';
    const lastName = job.lastname || '';
    const bikeBrand = job.bikebrand || '';
    const bikeModel = job.bikemodel || '';
    const bikeType = job.biketype || '';
    const serviceType = job.servicetype || 'Unknown';
    
    let actionBtn = '';
    switch(status) {
        case 'pending':
            actionBtn = `<button class="btn btn-accent" onclick="event.stopPropagation(); openJobDetail('${jobId}')">Triage</button>`;
            break;
        case 'triaged':
            actionBtn = `<button class="btn btn-primary" onclick="event.stopPropagation(); startRepair('${jobId}')">Start Repair</button>`;
            break;
        case 'in-progress':
            actionBtn = `<button class="btn btn-success" onclick="event.stopPropagation(); completeJob('${jobId}')">Complete</button>`;
            break;
        case 'completed':
            actionBtn = `<button class="btn btn-secondary" onclick="event.stopPropagation(); archiveJob('${jobId}')" style="font-size: 11px;">📦 Archive</button>`;
            break;
    }
    
    let timeInfo = '';
    if (status === 'in-progress' && job.startedat) {
        timeInfo = `<div class="time-note">Started ${timeAgo(job.startedat)}</div>`;
    } else if (status === 'completed') {
        timeInfo = `<div class="done-note">✓ Email sent to customer</div>`;
    }
    
    card.innerHTML = `
        <div class="job-card-header">
            <span class="job-id">#${jobId}</span>
            <span class="urgency-badge ${urgencyClass}">${urgencyLabel}</span>
        </div>
        <div class="customer-name">${firstName} ${lastName}</div>
        <div class="bike-info">${bikeBrand} ${bikeModel} ${bikeType ? '(' + bikeType + ')' : ''}</div>
        <span class="service-badge">${serviceType}</span>
        ${timeInfo}
        ${actionBtn ? `<div class="job-card-actions">${actionBtn}</div>` : ''}
    `;
    
    return card;
}

// ===== UPDATE STATS =====
function updateStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
        pending: allJobs.filter(j => j.status === 'pending').length,
        triaged: allJobs.filter(j => j.status === 'triaged').length,
        inProgress: allJobs.filter(j => j.status === 'in-progress').length,
        completed: allJobs.filter(j => {
            if (j.status !== 'completed') return false;
            const completedDate = new Date(j.completedat);
            return completedDate >= today;
        }).length
    };
    
    document.getElementById('statPending').textContent = stats.pending;
    document.getElementById('statTriaged').textContent = stats.triaged;
    document.getElementById('statProgress').textContent = stats.inProgress;
    document.getElementById('statCompleted').textContent = stats.completed;
}

// ===== LIST VIEW =====
function filterJobList() {
    const searchTerm = (document.getElementById('jobSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const urgencyFilter = document.getElementById('urgencyFilter')?.value || '';
    
    filteredJobs = allJobs.filter(job => {
        if (statusFilter) {
            const jobStatus = (job.status || 'pending').toLowerCase().replace(' ', '-');
            if (jobStatus !== statusFilter) return false;
        }
        
        if (urgencyFilter) {
            const jobUrgency = (job.urgency || 'medium').toLowerCase();
            if (jobUrgency !== urgencyFilter) return false;
        }
        
        if (searchTerm) {
            const searchableText = [
                job.jobid || '',
                job.firstname || '',
                job.lastname || '',
                job.bikebrand || '',
                job.bikemodel || '',
                job.biketype || '',
                job.servicetype || '',
                job.phone || '',
                job.email || ''
            ].join(' ').toLowerCase();
            
            if (!searchableText.includes(searchTerm)) return false;
        }
        
        return true;
    });
    
    const resultsEl = document.getElementById('filterResults');
    if (resultsEl) {
        resultsEl.textContent = `${filteredJobs.length} job${filteredJobs.length !== 1 ? 's' : ''}`;
    }
    
    renderListView();
}

function renderListView() {
    const tbody = document.getElementById('listTableBody');
    tbody.innerHTML = '';
    
    const jobsToRender = filteredJobs.length > 0 || document.getElementById('jobSearchInput')?.value ? filteredJobs : allJobs;
    
    const sortedJobs = [...jobsToRender].sort((a, b) => {
        const dateA = a.createdat ? new Date(a.createdat) : new Date(0);
        const dateB = b.createdat ? new Date(b.createdat) : new Date(0);
        return dateB - dateA;
    });
    
    sortedJobs.forEach(job => {
        const status = (job.status || 'pending').toLowerCase();
        const statusClass = `status-${status.replace(' ', '-')}`;
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
        
        const tr = document.createElement('tr');
        tr.onclick = () => openJobDetail(job.jobid);
        tr.innerHTML = `
            <td><strong>${job.jobid || '-'}</strong></td>
            <td>${job.firstname || ''} ${job.lastname || ''}</td>
            <td>${job.bikebrand || ''} ${job.bikemodel || ''}</td>
            <td>${job.servicetype || '-'}</td>
            <td><span class="status-cell ${statusClass}">${statusLabel}</span></td>
            <td>${(job.urgency || 'medium').charAt(0).toUpperCase() + (job.urgency || 'medium').slice(1)}</td>
            <td>${job.createdat ? timeAgo(job.createdat) : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
    
    if (sortedJobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">No jobs found</td></tr>';
    }
}

// ===== JOB DETAIL PANEL =====
function openJobDetail(jobId) {
    const job = allJobs.find(j => j.jobid === jobId);
    if (!job) return;
    
    currentDetailJob = job;
    
    document.getElementById('detailJobId').textContent = `Job #${job.jobid}`;
    document.getElementById('detailName').textContent = `${job.firstname} ${job.lastname}`;
    document.getElementById('detailPhone').textContent = job.phone || '-';
    document.getElementById('detailEmail').textContent = job.email || '-';
    document.getElementById('detailBike').innerHTML = `<strong>${job.bikebrand} ${job.bikemodel}</strong> (${job.biketype})`;
    document.getElementById('detailNeededBy').textContent = job.neededbytext || 'Not specified';
    document.getElementById('detailServiceType').textContent = job.servicetype;
    document.getElementById('detailDescription').textContent = job.description || 'No description provided';
    
    let checklist = job.checklist || [];
    if (typeof checklist === 'string') {
        try { checklist = JSON.parse(checklist); } catch(e) { checklist = []; }
    }
    document.getElementById('detailChecklist').innerHTML = checklist.length > 0 
        ? checklist.map(item => `- ${item}`).join('<br>')
        : 'No checklist items';
    
    document.getElementById('detailUrgency').value = job.urgency || 'medium';
    document.getElementById('detailComplexity').value = job.complexity || 'moderate';
    document.getElementById('detailWorkNotes').value = job.worknotes || '';
    
    const actionBtn = document.getElementById('detailActionBtn');
    const cancelBtn = document.getElementById('detailCancelBtn');
    
    cancelBtn.style.display = (job.status !== 'completed') ? 'inline-flex' : 'none';
    
    actionBtn.onclick = handleJobAction;
    
    switch(job.status) {
        case 'pending':
            actionBtn.textContent = 'Save & Triage';
            actionBtn.className = 'btn btn-accent';
            break;
        case 'triaged':
            actionBtn.textContent = 'Start Repair';
            actionBtn.className = 'btn btn-primary';
            break;
        case 'in-progress':
            actionBtn.textContent = 'Mark Complete';
            actionBtn.className = 'btn btn-success';
            break;
        case 'completed':
            actionBtn.textContent = 'Archive Job';
            actionBtn.className = 'btn btn-secondary';
            actionBtn.onclick = () => archiveJob(job.jobid);
            break;
    }
    
    document.getElementById('jobDetailOverlay').classList.add('active');
}

function closeJobDetail() {
    document.getElementById('jobDetailOverlay').classList.remove('active');
    currentDetailJob = null;
}

function handleJobAction() {
    if (!currentDetailJob) return;
    
    const urgency = document.getElementById('detailUrgency').value;
    const complexity = document.getElementById('detailComplexity').value;
    const workNotes = document.getElementById('detailWorkNotes').value;
    
    switch(currentDetailJob.status) {
        case 'pending':
            triageJob(currentDetailJob.jobid, urgency, complexity, workNotes);
            break;
        case 'triaged':
            startRepair(currentDetailJob.jobid);
            break;
        case 'in-progress':
            completeJob(currentDetailJob.jobid);
            break;
        case 'completed':
            archiveJob(currentDetailJob.jobid);
            break;
    }
}

// ===== JOB ACTIONS (Using apiCall) =====
async function triageJob(jobId, urgency, complexity, workNotes) {
    showLoading(true);
    
    try {
        const result = await apiCall('triageJob', { jobId, urgency, complexity, workNotes });
        
        if (result.success) {
            showToast('Job triaged successfully!', 'success');
            closeJobDetail();
            loadAllJobs();
        } else {
            showToast('Error triaging job: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Triage error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function startRepair(jobId) {
    showLoading(true);
    
    try {
        const result = await apiCall('updateStatus', { jobId, status: 'in-progress' });
        
        if (result.success) {
            showToast('Repair started!', 'success');
            closeJobDetail();
            loadAllJobs();
        } else {
            showToast('Error starting repair: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Start repair error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function completeJob(jobId) {
    if (!confirm('Mark this job as complete? An email will be sent to the customer.')) {
        return;
    }
    
    showLoading(true);
    
    try {
        // Get fresh job data
        const job = allJobs.find(j => j.jobid === jobId);
        
        // Generate completion PDF
        let pdfBase64 = null;
        if (job) {
            try {
                pdfBase64 = generateCompletionPDFBase64(job);
            } catch (e) {
                console.log('PDF generation error:', e);
            }
        }
        
        // Complete job via Apps Script (handles email, Drive PDF save)
        const result = await apiCall('completeJob', { 
            jobId, 
            pdfBase64,
            workNotes: document.getElementById('detailWorkNotes')?.value || ''
        });
        
        if (result.success) {
            let message = 'Job completed!';
            if (result.emailSent) message += ' Customer notified.';
            showToast(message, 'success');
            closeJobDetail();
            loadAllJobs();
        } else {
            showToast('Error completing job: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Complete job error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function archiveJob(jobId) {
    if (!confirm('Archive this job? It will be moved to the archive sheet.')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const result = await apiCall('archiveJob', { jobId });
        
        if (result.success) {
            showToast('Job archived!', 'success');
            closeJobDetail();
            loadAllJobs();
        } else {
            showToast('Error archiving job: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Archive error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function archiveAllCompleted() {
    if (!confirm('Archive all completed jobs?')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const result = await apiCall('archiveAllCompleted', {});
        
        if (result.success) {
            showToast(`Archived ${result.archivedCount} jobs!`, 'success');
            loadAllJobs();
        } else {
            showToast('Error archiving jobs: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Archive all error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ===== CANCEL JOB =====
function showCancelModal() {
    if (!currentDetailJob) return;
    
    document.getElementById('cancelJobId').textContent = currentDetailJob.jobid;
    document.getElementById('cancelReason').value = '';
    document.getElementById('cancelModalOverlay').classList.add('active');
}

function hideCancelModal() {
    document.getElementById('cancelModalOverlay').classList.remove('active');
}

async function confirmCancelJob() {
    if (!currentDetailJob) return;
    
    const reason = document.getElementById('cancelReason').value.trim();
    
    showLoading(true);
    hideCancelModal();
    
    try {
        const result = await apiCall('cancelJob', { jobId: currentDetailJob.jobid, reason });
        
        if (result.success) {
            let message = 'Job cancelled.';
            if (result.emailSent) message += ' Customer notified.';
            showToast(message, 'success');
            closeJobDetail();
            loadAllJobs();
        } else {
            showToast('Error cancelling job: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Cancel job error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ===== COMPLETION PDF GENERATION =====
function generateCompletionPDFBase64(job) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const brandGreen = [40, 167, 69];
    const brandCyan = [41, 171, 226];
    const brandDark = [26, 26, 26];
    const textGray = [102, 102, 102];

    // Green header
    doc.setFillColor(...brandGreen);
    doc.rect(0, 0, 210, 45, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('grannygear', 115, 18, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('SERVICE COMPLETION REPORT', 115, 28, { align: 'center' });

    // Job ID badge
    doc.setFillColor(...brandDark);
    doc.roundedRect(80, 50, 50, 12, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(job.jobid || 'GG-XXX', 105, 58, { align: 'center' });

    const completedDate = new Date();
    doc.setTextColor(...textGray);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Completed: ${completedDate.toLocaleDateString('en-ZA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })}`, 15, 70);

    let yPos = 80;
    
    // Customer Details
    doc.setFillColor(248, 249, 250);
    doc.rect(15, yPos - 5, 180, 30, 'F');
    doc.setTextColor(...brandDark);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CUSTOMER DETAILS', 20, yPos + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textGray);
    yPos += 12;
    doc.text(`Name: ${job.firstname || ''} ${job.lastname || ''}`, 20, yPos);
    doc.text(`Phone: ${job.phone || 'N/A'}`, 110, yPos);
    yPos += 7;
    doc.text(`Email: ${job.email || 'Not provided'}`, 20, yPos);

    // Bicycle
    yPos += 18;
    doc.setFillColor(248, 249, 250);
    doc.rect(15, yPos - 5, 180, 22, 'F');
    doc.setTextColor(...brandDark);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('BICYCLE', 20, yPos + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textGray);
    yPos += 12;
    doc.text(`${job.bikebrand || ''} ${job.bikemodel || ''}`, 20, yPos);
    doc.text(`Type: ${job.biketype || ''}`, 110, yPos);

    // Service Banner
    yPos += 18;
    doc.setFillColor(...brandCyan);
    doc.rect(15, yPos - 5, 180, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`SERVICE COMPLETED: ${(job.servicetype || 'Standard').toUpperCase()}`, 20, yPos + 2);

    // Work Performed
    yPos += 18;
    doc.setTextColor(...brandDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('WORK PERFORMED', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    yPos += 8;
    
    let checklist = job.checklist || [];
    if (typeof checklist === 'string') {
        try { checklist = JSON.parse(checklist); } catch(e) { checklist = []; }
    }
    
    checklist.forEach((item) => {
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFillColor(...brandGreen);
        doc.rect(20, yPos - 3, 4, 4, 'F');
        doc.text(item, 28, yPos);
        yPos += 7;
    });

    // Work Notes
    if (job.worknotes) {
        yPos += 8;
        if (yPos > 220) { doc.addPage(); yPos = 20; }
        
        doc.setFillColor(255, 243, 205);
        const notesHeight = Math.min(30, 15 + (job.worknotes.length / 50) * 5);
        doc.rect(15, yPos - 5, 180, notesHeight, 'F');
        doc.setTextColor(133, 100, 4);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Mechanic Notes:', 20, yPos + 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const noteLines = doc.splitTextToSize(job.worknotes, 165);
        doc.text(noteLines, 20, yPos + 10);
        yPos += notesHeight + 5;
    }

    // Service Summary
    if (yPos > 220) { doc.addPage(); yPos = 20; }
    yPos += 10;
    doc.setFillColor(212, 237, 218);
    doc.roundedRect(15, yPos - 5, 180, 35, 3, 3, 'F');
    doc.setTextColor(21, 87, 36);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Service Summary', 20, yPos + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    yPos += 12;
    
    const createdDate = job.createdat ? new Date(job.createdat) : new Date();
    doc.text(`Date Received:`, 20, yPos);
    doc.text(createdDate.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), 150, yPos, { align: 'right' });
    yPos += 7;
    doc.text(`Date Completed:`, 20, yPos);
    doc.text(completedDate.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), 150, yPos, { align: 'right' });
    yPos += 7;
    
    const hoursInShop = Math.round((completedDate - createdDate) / (1000 * 60 * 60));
    const daysInShop = Math.floor(hoursInShop / 24);
    const timeInShop = daysInShop > 0 ? `${daysInShop} day(s), ${hoursInShop % 24} hour(s)` : `${Math.max(1, hoursInShop)} hour(s)`;
    doc.setFont('helvetica', 'bold');
    doc.text(`Time in Shop:`, 20, yPos);
    doc.text(timeInShop, 150, yPos, { align: 'right' });

    // Footer
    doc.setFillColor(...brandDark);
    doc.rect(0, 277, 210, 20, 'F');
    doc.setTextColor(153, 153, 153);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Granny Gear | www.grannygear.co.za | info@grannygear.co.za | +27 21 001 0221 | +27 65 507 0829', 105, 285, { align: 'center' });
    doc.text('Thank you for your business!', 105, 291, { align: 'center' });
    
    return doc.output('datauristring').split(',')[1];
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeJobDetail();
        hideCancelModal();
    }
});
