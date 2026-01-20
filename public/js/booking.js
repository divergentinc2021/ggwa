/* ===== GRANNY GEAR WORKSHOP - BOOKING FORM JS ===== */

// Form data state
let formData = {
    firstName: '', lastName: '', email: '', phone: '',
    boardNumber: '', bikeBrand: '', bikeModel: '',
    bikeType: '', neededBy: '', neededByText: '', serviceType: '',
    checklist: [], description: '', jobId: '', queuePosition: 0
};

let currentPin = '';

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initDatePicker();
    generateChecklist();
    initPWA();
});

function initDatePicker() {
    const dateInput = document.getElementById('neededByDate');
    if (!dateInput) return;
    
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + 1);
    dateInput.min = minDate.toISOString().split('T')[0];
}

function generateChecklist() {
    const section = document.getElementById('checklistSection');
    if (!section) return;
    
    let html = '<h4>Stage 1 - Inspection & Adjustment</h4>';
    
    SERVICE_CHECKLIST.stage1.forEach((item, index) => {
        html += `
            <div class="checklist-item">
                <input type="checkbox" id="${item.id}">
                <label for="${item.id}">${item.label}</label>
            </div>
        `;
    });
    
    html += '<h4 style="margin-top: 20px;">Stage 2 - Major Service Items</h4>';
    
    SERVICE_CHECKLIST.stage2.forEach((item, index) => {
        html += `
            <div class="checklist-item">
                <input type="checkbox" id="${item.id}">
                <label for="${item.id}">${item.label}</label>
            </div>
        `;
    });
    
    section.innerHTML = html;
}

// ===== VALIDATION =====
function clearValidation(input) {
    input.classList.remove('invalid', 'valid');
    const errorSpan = document.getElementById(input.id + 'Error');
    if (errorSpan) {
        errorSpan.classList.remove('visible');
    }
}

function validateEmailField(input) {
    const value = input.value.trim();
    const errorSpan = document.getElementById('emailError');
    
    if (!value) {
        input.classList.remove('invalid', 'valid');
        errorSpan.classList.remove('visible');
        return true;
    }
    
    if (validateEmail(value)) {
        input.classList.remove('invalid');
        input.classList.add('valid');
        errorSpan.classList.remove('visible');
        return true;
    } else {
        input.classList.remove('valid');
        input.classList.add('invalid');
        errorSpan.classList.add('visible');
        return false;
    }
}

function validatePhoneField(input) {
    const value = input.value.trim();
    const errorSpan = document.getElementById('phoneError');
    
    if (validatePhone(value)) {
        input.classList.remove('invalid');
        input.classList.add('valid');
        errorSpan.classList.remove('visible');
        return true;
    } else {
        input.classList.remove('valid');
        input.classList.add('invalid');
        errorSpan.classList.add('visible');
        return false;
    }
}

function validateBoardField(input) {
    const value = input.value.trim();
    const errorSpan = document.getElementById('boardError');
    
    if (!value) {
        input.classList.remove('invalid', 'valid');
        errorSpan.classList.remove('visible');
        return true;
    }
    
    const boardPattern = /^[0-9]{1,5}$/;
    if (boardPattern.test(value)) {
        input.classList.remove('invalid');
        input.classList.add('valid');
        errorSpan.classList.remove('visible');
        return true;
    } else {
        input.classList.remove('valid');
        input.classList.add('invalid');
        errorSpan.classList.add('visible');
        return false;
    }
}

function validateStep1() {
    const phoneInput = document.getElementById('phone');
    const emailInput = document.getElementById('email');
    const boardInput = document.getElementById('boardNumber');
    
    let isValid = true;
    
    if (!validatePhoneField(phoneInput)) {
        phoneInput.focus();
        isValid = false;
    }
    
    if (emailInput.value.trim() && !validateEmailField(emailInput)) {
        if (isValid) emailInput.focus();
        isValid = false;
    }
    
    if (boardInput.value.trim() && !validateBoardField(boardInput)) {
        if (isValid) boardInput.focus();
        isValid = false;
    }
    
    return isValid;
}

// ===== FORM NAVIGATION =====
function nextStep(step) {
    const currentStep = document.querySelector('.form-step.active');
    
    if (currentStep && currentStep.dataset.step === '1' && step > 1) {
        if (!validateStep1()) {
            return;
        }
    }
    
    collectFormData();
    
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.step-dot').forEach(d => d.classList.remove('active', 'completed'));
    document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');
    
    for (let i = 1; i <= 4; i++) {
        const dot = document.querySelector(`.step-dot[data-step="${i}"]`);
        if (i < step) dot.classList.add('completed');
        else if (i === step) dot.classList.add('active');
    }
    
    if (step === 3) updateSummary();
    
    // Scroll to top
    window.scrollTo(0, 0);
}

function collectFormData() {
    formData.firstName = document.getElementById('firstName').value;
    formData.lastName = document.getElementById('lastName').value;
    formData.email = document.getElementById('email').value;
    formData.phone = document.getElementById('phone').value;
    formData.boardNumber = document.getElementById('boardNumber').value;
    formData.bikeBrand = document.getElementById('bikeBrand').value;
    formData.bikeModel = document.getElementById('bikeModel').value;
    
    const selectedBikeType = document.querySelector('.bike-type-option.selected');
    if (selectedBikeType) formData.bikeType = selectedBikeType.dataset.type;
    
    const selectedService = document.querySelector('.service-type-card.selected');
    if (selectedService) formData.serviceType = selectedService.dataset.service;
    
    formData.description = document.getElementById('description')?.value || '';
    
    // Collect checklist items
    formData.checklist = [];
    const allItems = [...SERVICE_CHECKLIST.stage1, ...SERVICE_CHECKLIST.stage2];
    allItems.forEach(item => {
        const checkbox = document.getElementById(item.id);
        if (checkbox && checkbox.checked) {
            formData.checklist.push(item.label);
        }
    });
}

function updateSummary() {
    document.getElementById('summaryName').textContent = `${formData.firstName} ${formData.lastName}`;
    document.getElementById('summaryBike').textContent = `${formData.bikeBrand} ${formData.bikeModel} (${formData.bikeType})`;
    document.getElementById('summaryDate').textContent = formData.neededByText || 'Not specified';
}

// ===== BIKE TYPE SELECTION =====
function selectBikeType(element, type) {
    document.querySelectorAll('.bike-type-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    formData.bikeType = type;
}

// ===== SERVICE TYPE SELECTION =====
function selectServiceType(element, type) {
    document.querySelectorAll('.service-type-card').forEach(card => card.classList.remove('selected'));
    element.classList.add('selected');
    formData.serviceType = type;
    
    // Apply preset checklist selections
    const allItems = [...SERVICE_CHECKLIST.stage1, ...SERVICE_CHECKLIST.stage2];
    allItems.forEach((item, index) => {
        const chk = document.getElementById(item.id);
        if (chk) chk.checked = false;
    });
    
    const preset = SERVICE_PRESETS[type] || [];
    preset.forEach(num => {
        const chk = document.getElementById(`chk${num}`);
        if (chk) chk.checked = true;
    });
}

// ===== DATE SELECTION =====
function setQuickDate(option) {
    const dateInput = document.getElementById('neededByDate');
    const today = new Date();
    let targetDate = new Date(today);
    let dateText = '';
    
    document.querySelectorAll('.date-option-btn').forEach(btn => btn.classList.remove('selected'));
    event.target.classList.add('selected');
    
    switch(option) {
        case 'asap': 
            targetDate.setDate(today.getDate() + 1); 
            dateText = 'ASAP (Tomorrow)'; 
            break;
        case 'tomorrow': 
            targetDate.setDate(today.getDate() + 1); 
            dateText = 'Tomorrow'; 
            break;
        case '3days': 
            targetDate.setDate(today.getDate() + 3); 
            dateText = 'In 3 Days'; 
            break;
        case 'week': 
            targetDate.setDate(today.getDate() + 7); 
            dateText = 'Next Week'; 
            break;
        case 'custom': 
            dateInput.focus(); 
            return;
    }
    
    dateInput.value = targetDate.toISOString().split('T')[0];
    formData.neededBy = dateInput.value;
    formData.neededByText = dateText || formatDate(targetDate);
}

function selectCustomDate() {
    const dateInput = document.getElementById('neededByDate');
    document.querySelectorAll('.date-option-btn').forEach(btn => btn.classList.remove('selected'));
    formData.neededBy = dateInput.value;
    formData.neededByText = formatDate(new Date(dateInput.value));
}

// ===== PIN PAD =====
function showOperatorPinPad() {
    collectFormData();
    document.getElementById('pinOverlay').classList.add('active');
    currentPin = '';
    updatePinDisplay();
}

function hidePinPad() {
    document.getElementById('pinOverlay').classList.remove('active');
    currentPin = '';
    updatePinDisplay();
}

function enterPin(digit) {
    if (currentPin.length < 4) {
        currentPin += digit;
        updatePinDisplay();
    }
}

function clearPin() {
    currentPin = '';
    updatePinDisplay();
}

function updatePinDisplay() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`pinDot${i}`);
        if (dot) {
            dot.classList.toggle('filled', i <= currentPin.length);
        }
    }
}

async function verifyOperatorPin() {
    if (currentPin.length !== 4) {
        showToast('Please enter 4-digit PIN', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        // Verify PIN via Apps Script
        const result = await apiCall('verifyPin', { pin: currentPin });
        
        if (result.success) {
            // Reserve job ID via Apps Script
            const reserveResult = await apiCall('reserveJobId', {});
            
            if (reserveResult.success) {
                formData.jobId = reserveResult.jobId;
                hidePinPad();
                nextStep(3);
                displayJobIdInStep3(reserveResult.jobId);
            } else {
                showToast('Error reserving Job ID: ' + reserveResult.error, 'error');
                clearPin();
            }
        } else {
            showToast('Invalid PIN. Please try again.', 'error');
            clearPin();
        }
    } catch (error) {
        console.error('PIN verification error:', error);
        showToast('Connection error. Please try again.', 'error');
        clearPin();
    } finally {
        showLoading(false);
    }
}

function displayJobIdInStep3(jobId) {
    const summaryDiv = document.getElementById('customerSummary');
    const existingBadge = summaryDiv.querySelector('.job-id-badge');
    if (existingBadge) existingBadge.remove();
    
    const badge = document.createElement('div');
    badge.className = 'job-id-badge';
    badge.textContent = jobId;
    summaryDiv.insertBefore(badge, summaryDiv.firstChild);
}

// Keyboard support for PIN pad
document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('pinOverlay');
    if (!overlay.classList.contains('active')) return;
    
    if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        enterPin(parseInt(e.key));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        clearPin();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        verifyOperatorPin();
    } else if (e.key === 'Escape') {
        hidePinPad();
    }
});

// ===== JOB SUBMISSION =====
async function submitJob() {
    collectFormData();
    
    if (!formData.serviceType) {
        showToast('Please select a service type', 'warning');
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating PDF...';
    showLoading(true);
    
    // Generate PDF
    let pdfBase64 = null;
    try {
        pdfBase64 = generatePDFBase64();
    } catch (e) {
        console.log('PDF generation error:', e);
    }
    
    submitBtn.textContent = 'Submitting...';
    
    try {
        // Submit job via Apps Script (handles Sheets, Email, Drive)
        const result = await apiCall('createJob', {
            ...formData,
            pdfBase64: pdfBase64
        });
        
        if (result.success) {
            formData.jobId = result.jobId;
            formData.queuePosition = result.queuePosition;
            
            document.getElementById('confirmJobId').textContent = result.jobId;
            document.getElementById('confirmEmailAddress').textContent = formData.email || '(no email provided)';
            document.getElementById('queuePosition').textContent = result.queuePosition;
            
            // Email status
            const emailStatusEl = document.getElementById('emailStatus');
            const es = result.emailStatus || {};
            
            if (formData.email && formData.email.includes('@')) {
                if (es.customerEmailSent) {
                    emailStatusEl.className = 'email-status success';
                    emailStatusEl.innerHTML = `✓ Confirmation email sent to <strong>${formData.email}</strong>`;
                } else {
                    emailStatusEl.className = 'email-status error';
                    emailStatusEl.innerHTML = `⚠ Email to ${formData.email} could not be sent. We'll contact you by phone.`;
                }
            } else {
                emailStatusEl.className = 'email-status info';
                emailStatusEl.innerHTML = 'Provide an email to receive confirmations';
            }
            
            // PDF saved status
            if (result.pdfSaved) {
                showToast('PDF saved to Google Drive!', 'success');
            }
            
            emailStatusEl.style.display = 'block';
            nextStep(4);
            showToast('Job submitted successfully!', 'success');
        } else {
            showToast('Error submitting job: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Submit error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        showLoading(false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit to Queue';
    }
}

// ===== PDF GENERATION =====
function generatePDFBase64() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const brandCyan = [41, 171, 226];
    const brandDark = [26, 26, 26];
    const textGray = [102, 102, 102];

    // Header
    doc.setFillColor(...brandCyan);
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('grannygear', 115, 18, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('SERVICE TICKET', 115, 28, { align: 'center' });

    // Job ID badge
    doc.setFillColor(...brandDark);
    doc.roundedRect(80, 50, 50, 12, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(formData.jobId || 'GG-XXX', 105, 58, { align: 'center' });

    // Date
    doc.setTextColor(...textGray);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const dateStr = new Date().toLocaleDateString('en-ZA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    doc.text(`Date: ${dateStr}`, 15, 70);

    let yPos = 80;
    
    // Customer Details
    doc.setFillColor(248, 249, 250);
    doc.rect(15, yPos - 5, 180, 35, 'F');
    doc.setTextColor(...brandDark);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CUSTOMER DETAILS', 20, yPos + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textGray);
    yPos += 12;
    doc.text(`Name: ${formData.firstName} ${formData.lastName}`, 20, yPos);
    doc.text(`Phone: ${formData.phone}`, 110, yPos);
    yPos += 7;
    doc.text(`Email: ${formData.email || 'Not provided'}`, 20, yPos);
    doc.text(`Board #: ${formData.boardNumber || 'N/A'}`, 110, yPos);

    // Bicycle
    yPos += 20;
    doc.setFillColor(248, 249, 250);
    doc.rect(15, yPos - 5, 180, 25, 'F');
    doc.setTextColor(...brandDark);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('BICYCLE', 20, yPos + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textGray);
    yPos += 12;
    doc.text(`${formData.bikeBrand} ${formData.bikeModel}`, 20, yPos);
    doc.text(`Type: ${formData.bikeType}`, 110, yPos);

    // Service Type Banner
    yPos += 20;
    doc.setFillColor(...brandCyan);
    doc.setTextColor(255, 255, 255);
    doc.rect(15, yPos - 5, 180, 10, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`SERVICE TYPE: ${(formData.serviceType || 'STANDARD').toUpperCase()}`, 20, yPos + 2);

    yPos += 12;
    doc.setTextColor(...brandDark);
    doc.setFontSize(10);
    doc.text(`Needed by: ${formData.neededByText || 'Not specified'}`, 20, yPos);

    // Checklist
    yPos += 15;
    doc.setTextColor(...brandDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('SERVICE CHECKLIST', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    yPos += 8;
    
    (formData.checklist || []).forEach((item) => {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFillColor(...brandCyan);
        doc.rect(20, yPos - 3, 4, 4, 'F');
        doc.text(item, 28, yPos);
        yPos += 7;
    });

    // Description
    if (formData.description) {
        yPos += 10;
        doc.setTextColor(...brandDark);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('NOTES / DESCRIPTION', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...textGray);
        yPos += 8;
        const descLines = doc.splitTextToSize(formData.description, 170);
        doc.text(descLines, 20, yPos);
        yPos += descLines.length * 5;
    }

    // Queue position box
    if (yPos > 250) { doc.addPage(); yPos = 20; }
    yPos += 15;
    doc.setFillColor(255, 242, 0);
    doc.rect(15, yPos - 5, 180, 20, 'F');
    doc.setTextColor(26, 26, 26);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Queue Position: #${formData.queuePosition || '?'}`, 105, yPos + 7, { align: 'center' });

    // Footer
    doc.setTextColor(...textGray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Granny Gear | www.grannygear.co.za | info@grannygear.co.za | +27 21 001 0221 | +27 65 507 0829', 105, 285, { align: 'center' });
    
    return doc.output('datauristring').split(',')[1];
}

function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const brandCyan = [41, 171, 226];
    const brandDark = [26, 26, 26];
    const textGray = [102, 102, 102];

    // Same PDF generation as above...
    doc.setFillColor(...brandCyan);
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('grannygear', 115, 18, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('SERVICE TICKET', 115, 28, { align: 'center' });

    doc.setFillColor(...brandDark);
    doc.roundedRect(80, 50, 50, 12, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(formData.jobId, 105, 58, { align: 'center' });

    doc.setTextColor(...textGray);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const dateStr = new Date().toLocaleDateString('en-ZA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    doc.text(`Date: ${dateStr}`, 15, 70);

    let yPos = 80;
    doc.setFillColor(248, 249, 250);
    doc.rect(15, yPos - 5, 180, 35, 'F');
    doc.setTextColor(...brandDark);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CUSTOMER DETAILS', 20, yPos + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textGray);
    yPos += 12;
    doc.text(`Name: ${formData.firstName} ${formData.lastName}`, 20, yPos);
    doc.text(`Phone: ${formData.phone}`, 110, yPos);
    yPos += 7;
    doc.text(`Email: ${formData.email || 'Not provided'}`, 20, yPos);
    doc.text(`Board #: ${formData.boardNumber || 'N/A'}`, 110, yPos);

    yPos += 20;
    doc.setFillColor(248, 249, 250);
    doc.rect(15, yPos - 5, 180, 25, 'F');
    doc.setTextColor(...brandDark);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('BICYCLE', 20, yPos + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textGray);
    yPos += 12;
    doc.text(`${formData.bikeBrand} ${formData.bikeModel}`, 20, yPos);
    doc.text(`Type: ${formData.bikeType}`, 110, yPos);

    yPos += 20;
    doc.setFillColor(...brandCyan);
    doc.setTextColor(255, 255, 255);
    doc.rect(15, yPos - 5, 180, 10, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`SERVICE TYPE: ${formData.serviceType.toUpperCase()}`, 20, yPos + 2);

    yPos += 12;
    doc.setTextColor(...brandDark);
    doc.setFontSize(10);
    doc.text(`Needed by: ${formData.neededByText || 'Not specified'}`, 20, yPos);

    yPos += 15;
    doc.setTextColor(...brandDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('SERVICE CHECKLIST', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    yPos += 8;
    
    formData.checklist.forEach((item) => {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFillColor(...brandCyan);
        doc.rect(20, yPos - 3, 4, 4, 'F');
        doc.text(item, 28, yPos);
        yPos += 7;
    });

    if (formData.description) {
        yPos += 10;
        doc.setTextColor(...brandDark);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('NOTES / DESCRIPTION', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...textGray);
        yPos += 8;
        const descLines = doc.splitTextToSize(formData.description, 170);
        doc.text(descLines, 20, yPos);
        yPos += descLines.length * 5;
    }

    if (yPos > 250) { doc.addPage(); yPos = 20; }
    yPos += 15;
    doc.setFillColor(255, 242, 0);
    doc.rect(15, yPos - 5, 180, 20, 'F');
    doc.setTextColor(26, 26, 26);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Queue Position: #${formData.queuePosition}`, 105, yPos + 7, { align: 'center' });

    doc.setTextColor(...textGray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Granny Gear | www.grannygear.co.za | info@grannygear.co.za | +27 21 001 0221 | +27 65 507 0829', 105, 285, { align: 'center' });
    
    doc.save(`GrannyGear_ServiceTicket_${formData.jobId}.pdf`);
}

// ===== RESET FORM =====
function startNewJob() {
    document.getElementById('firstName').value = '';
    document.getElementById('lastName').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('boardNumber').value = '';
    document.getElementById('bikeBrand').value = '';
    document.getElementById('bikeModel').value = '';
    document.getElementById('description').value = '';
    document.getElementById('neededByDate').value = '';
    
    document.querySelectorAll('.bike-type-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelectorAll('.service-type-card').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('.date-option-btn').forEach(btn => btn.classList.remove('selected'));
    
    const allItems = [...SERVICE_CHECKLIST.stage1, ...SERVICE_CHECKLIST.stage2];
    allItems.forEach(item => {
        const checkbox = document.getElementById(item.id);
        if (checkbox) checkbox.checked = false;
    });
    
    formData = {
        firstName: '', lastName: '', email: '', phone: '',
        boardNumber: '', bikeBrand: '', bikeModel: '',
        bikeType: '', neededBy: '', neededByText: '', serviceType: '',
        checklist: [], description: '', jobId: '', queuePosition: 0
    };
    
    nextStep(1);
}
