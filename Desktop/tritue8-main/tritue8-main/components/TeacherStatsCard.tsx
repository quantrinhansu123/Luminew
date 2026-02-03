import { Card, Statistic, Row, Col, Spin } from 'antd';
import { ClockCircleOutlined, BookOutlined, TeamOutlined } from '@ant-design/icons';
import { useAttendanceStats } from '../hooks/useAttendanceStats';

interface TeacherStatsCardProps {
    teacherId: string;
}

const TeacherStatsCard = ({ teacherId }: TeacherStatsCardProps) => {
    const { loading, getTeacherStats } = useAttendanceStats();

    if (loading) {
        return <Spin />;
    }

    const stats = getTeacherStats(teacherId);

    return (
        <Card title="Thống kê giảng dạy" size="small">
            <Row gutter={16}>
                <Col span={8}>
                    <Statistic
                        title="Tổng số buổi dạy"
                        value={stats.totalSessions}
                        prefix={<BookOutlined />}
                    />
                </Col>
                <Col span={8}>
                    <Statistic
                        title="Tổng số giờ dạy"
                        value={stats.totalHours}
                        suffix="giờ"
                        prefix={<ClockCircleOutlined />}
                    />
                </Col>
                <Col span={8}>
                    <Statistic
                        title="Số lớp đang dạy"
                        value={stats.totalClasses}
                        prefix={<TeamOutlined />}
                    />
                </Col>
            </Row>
        </Card>
    );
};

export default TeacherStatsCard;
