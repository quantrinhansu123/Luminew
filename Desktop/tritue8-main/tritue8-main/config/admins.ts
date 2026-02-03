// Danh sách email admin
export const ADMIN_EMAILS = [
    'tskiet2811@gmail.com',
    'it_dev@giaphu.co',
    'mrliemkhiet@gmail.com', // Thêm email admin mới
    'htdat2711@gmail.com',   
    'hoangthuhue191103@gmail.com', 
    "tskiet2811@gmail.com"
];

export const isAdmin = (email: string | null | undefined): boolean => {
    if (!email) {
        console.log('🔍 isAdmin check: No email provided');
        return false;
    }
    
    const normalizedEmail = email.toLowerCase();
    const isAdminResult = ADMIN_EMAILS.includes(normalizedEmail);
    
    console.log('🔍 isAdmin check:', {
        originalEmail: email,
        normalizedEmail: normalizedEmail,
        adminEmails: ADMIN_EMAILS,
        isAdmin: isAdminResult
    });
    
    return isAdminResult;
};

