import { Button, Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

interface CourseCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    buttonText: string;
    buttonColor: string;
    gradientColors: string;
}

const CourseCard = ({ title, description, icon, buttonText, buttonColor, gradientColors }: CourseCardProps) => {
    return (
        <Card hoverable className='h-full overflow-hidden rounded-3xl shadow-lg' styles={{ body: { padding: 0 } }}>
            <div className={`${gradientColors} px-8 py-12 text-center`}>
                <div className='mb-4 flex items-center justify-center gap-2 text-6xl'>{icon}</div>
            </div>
            <div className='bg-white p-6 text-center'>
                <Title level={3} className='mb-2'>
                    {title}
                </Title>
                <Paragraph className='mb-4 text-gray-600'>{description}</Paragraph>
                <Button type='primary' size='large' className={`rounded-full ${buttonColor} px-6`}>
                    {buttonText}
                </Button>
            </div>
        </Card>
    );
};

export default CourseCard;
