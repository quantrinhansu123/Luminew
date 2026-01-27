/**
 * Team-Menu Mapping Configuration
 * 
 * This file defines which teams can access which menu modules.
 * Update this file when new teams are added or team names change.
 */

export const TEAM_MENU_CONFIG = {
    // Sales & Business Development
    sale: {
        teams: ['Sale', 'KD', 'SALE', 'Kinh doanh'],
        description: 'Sales and Business Development teams'
    },

    // Delivery & Warehouse
    delivery: {
        teams: ['Vận đơn', 'Vận Đơn', 'Van don', 'Kho', 'Warehouse'],
        description: 'Delivery and Warehouse teams'
    },

    // Marketing
    marketing: {
        teams: ['MKT', 'MARKETING', 'Marketing', 'Truyền thông'],
        description: 'Marketing and Communications teams'
    },

    // Research & Development
    rnd: {
        teams: ['R&D', 'RD', 'R&D Team', 'RnD'],
        description: 'Research and Development teams'
    },

    // Finance & Accounting
    finance: {
        teams: ['Kế toán', 'Tài chính', 'Finance', 'Accounting'],
        description: 'Finance and Accounting teams'
    },

    // Human Resources
    hr: {
        teams: ['HCNS', 'HR', 'Nhân sự', 'Hành chính', 'Human Resources'],
        description: 'Human Resources and Administration teams'
    },

    // Customer Service
    cskh: {
        teams: ['CSKH', 'Customer Service', 'Chăm sóc khách hàng', 'CS'],
        description: 'Customer Service teams'
    }
};

/**
 * Helper function to check if a user's team is allowed for a menu
 * @param {string} userTeam - The team name from user's profile
 * @param {string[]} allowedTeamKeys - Array of menu keys (e.g., ['sale', 'marketing'])
 * @returns {boolean} - True if user's team is allowed
 */
export function isTeamAllowed(userTeam, allowedTeamKeys) {
    if (!userTeam || !allowedTeamKeys || allowedTeamKeys.length === 0) {
        return true; // No restriction if not specified
    }

    const normalizedUserTeam = userTeam.toLowerCase().trim();

    return allowedTeamKeys.some(key => {
        const config = TEAM_MENU_CONFIG[key];
        if (!config) return false;

        return config.teams.some(allowedTeam =>
            normalizedUserTeam.includes(allowedTeam.toLowerCase())
        );
    });
}

export default TEAM_MENU_CONFIG;
